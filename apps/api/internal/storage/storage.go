package storage

import (
	"context"
	"fmt"
	"io"
	"log"
	"mime"
	"os"
	"path/filepath"
	"strings"

	"github.com/minio/minio-go/v7"
)

// Storage defines the common interface for media storage (Local Disk or S3/MinIO)
type Storage interface {
	Save(ctx context.Context, key string, reader io.Reader, size int64, contentType string) error
	Get(ctx context.Context, key string) (io.ReadCloser, int64, string, error)
	Delete(ctx context.Context, key string) error
	Type() string
}

// LocalStorage stores media files directly on the local filesystem
type LocalStorage struct {
	baseDir      string
	fallbackDirs []string
}

func NewLocalStorage(baseDir string, fallbackDirs []string) *LocalStorage {
	cleanBase := filepath.Clean(baseDir)
	if err := os.MkdirAll(cleanBase, 0755); err != nil {
		log.Printf("[LocalStorage] Warning: failed to create base directory %s: %v", cleanBase, err)
	}

	cleanFallbacks := make([]string, 0, len(fallbackDirs))
	for _, dir := range fallbackDirs {
		if dir != "" && dir != cleanBase {
			cleanFallbacks = append(cleanFallbacks, filepath.Clean(dir))
		}
	}

	return &LocalStorage{
		baseDir:      cleanBase,
		fallbackDirs: cleanFallbacks,
	}
}

func (s *LocalStorage) Type() string {
	return "local"
}

func (s *LocalStorage) Save(ctx context.Context, key string, reader io.Reader, size int64, contentType string) error {
	cleanKey := strings.TrimPrefix(filepath.Clean("/"+key), "/")
	fullPath := filepath.Join(s.baseDir, cleanKey)

	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create directory %s: %w", dir, err)
	}

	f, err := os.Create(fullPath)
	if err != nil {
		return fmt.Errorf("failed to create file %s: %w", fullPath, err)
	}
	defer f.Close()

	if _, err := io.Copy(f, reader); err != nil {
		return fmt.Errorf("failed to write file %s: %w", fullPath, err)
	}

	return nil
}

func (s *LocalStorage) Get(ctx context.Context, key string) (io.ReadCloser, int64, string, error) {
	cleanKey := strings.TrimPrefix(filepath.Clean("/"+key), "/")

	// Candidate paths to look for the file
	candidates := []string{
		filepath.Join(s.baseDir, cleanKey),
		filepath.Join(s.baseDir, "klados-media", cleanKey),
	}

	for _, fb := range s.fallbackDirs {
		candidates = append(candidates,
			filepath.Join(fb, cleanKey),
			filepath.Join(fb, "klados-media", cleanKey),
		)
	}

	// Try each candidate path
	tryPath := func(p string) (io.ReadCloser, int64, string, bool) {
		f, err := os.Open(p)
		if err != nil {
			return nil, 0, "", false
		}
		stat, sErr := f.Stat()
		if sErr != nil {
			f.Close()
			return nil, 0, "", false
		}
		if stat.IsDir() {
			// MinIO object directory format: contains part.1
			partPath := filepath.Join(p, "part.1")
			partF, pErr := os.Open(partPath)
			if pErr == nil {
				partStat, psErr := partF.Stat()
				if psErr == nil && !partStat.IsDir() {
					f.Close()
					ext := filepath.Ext(p)
					cType := mime.TypeByExtension(ext)
					if cType == "" {
						cType = "application/octet-stream"
					}
					return partF, partStat.Size(), cType, true
				}
				partF.Close()
			}
			f.Close()
			return nil, 0, "", false
		}

		ext := filepath.Ext(p)
		cType := mime.TypeByExtension(ext)
		if cType == "" {
			cType = "application/octet-stream"
		}
		return f, stat.Size(), cType, true
	}

	for _, p := range candidates {
		if rc, size, cType, ok := tryPath(p); ok {
			return rc, size, cType, nil
		}
	}

	// Deep search for base filename across sites/ directories if not found in exact path
	baseName := filepath.Base(cleanKey)
	if baseName != "" && baseName != "." {
		searchRoots := []string{s.baseDir, filepath.Join(s.baseDir, "klados-media")}
		for _, fb := range s.fallbackDirs {
			searchRoots = append(searchRoots, fb, filepath.Join(fb, "klados-media"))
		}

		for _, root := range searchRoots {
			// Search: root/sites/*/media/baseName
			patterns := []string{
				filepath.Join(root, "sites", "*", "media", baseName),
				filepath.Join(root, "media", baseName),
				filepath.Join(root, baseName),
			}
			for _, pat := range patterns {
				matches, _ := filepath.Glob(pat)
				for _, m := range matches {
					if rc, size, cType, ok := tryPath(m); ok {
						return rc, size, cType, nil
					}
				}
			}
		}
	}

	return nil, 0, "", os.ErrNotExist
}

func (s *LocalStorage) Delete(ctx context.Context, key string) error {
	cleanKey := strings.TrimPrefix(filepath.Clean("/"+key), "/")
	fullPath := filepath.Join(s.baseDir, cleanKey)
	_ = os.Remove(fullPath)

	for _, fb := range s.fallbackDirs {
		_ = os.Remove(filepath.Join(fb, cleanKey))
		_ = os.Remove(filepath.Join(fb, "klados-media", cleanKey))
	}

	return nil
}

// S3Storage stores media files in an S3-compatible service (MinIO, AWS S3, Cloudflare R2)
// with a local fallback for reading existing or cached files.
type S3Storage struct {
	client   *minio.Client
	bucket   string
	fallback *LocalStorage
}

func NewS3Storage(client *minio.Client, bucket string, fallback *LocalStorage) *S3Storage {
	return &S3Storage{
		client:   client,
		bucket:   bucket,
		fallback: fallback,
	}
}

func (s *S3Storage) Type() string {
	return "s3"
}

func (s *S3Storage) Save(ctx context.Context, key string, reader io.Reader, size int64, contentType string) error {
	cleanKey := strings.TrimPrefix(filepath.Clean("/"+key), "/")

	// If local fallback is configured, also save locally for fast serving and resilience
	if s.fallback != nil {
		// Read into buffer or tee if needed, or upload to S3 first
	}

	_, err := s.client.PutObject(ctx, s.bucket, cleanKey, reader, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		// If S3 upload fails but fallback is available, attempt fallback save
		if s.fallback != nil {
			log.Printf("[S3Storage] Warning: S3 PutObject failed (%v), falling back to local storage", err)
			return s.fallback.Save(ctx, key, reader, size, contentType)
		}
		return err
	}

	return nil
}

func (s *S3Storage) Get(ctx context.Context, key string) (io.ReadCloser, int64, string, error) {
	cleanKey := strings.TrimPrefix(filepath.Clean("/"+key), "/")

	// Try S3 first
	obj, err := s.client.GetObject(ctx, s.bucket, cleanKey, minio.GetObjectOptions{})
	if err == nil {
		stat, sErr := obj.Stat()
		if sErr == nil {
			return obj, stat.Size, stat.ContentType, nil
		}
		obj.Close()
	}

	// Fallback to local storage if available
	if s.fallback != nil {
		return s.fallback.Get(ctx, key)
	}

	return nil, 0, "", err
}

func (s *S3Storage) Delete(ctx context.Context, key string) error {
	cleanKey := strings.TrimPrefix(filepath.Clean("/"+key), "/")
	_ = s.client.RemoveObject(ctx, s.bucket, cleanKey, minio.RemoveObjectOptions{})

	if s.fallback != nil {
		_ = s.fallback.Delete(ctx, key)
	}
	return nil
}

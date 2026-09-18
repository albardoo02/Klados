'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sitesApi } from '@/lib/api';
import Link from 'next/link';
import { useState } from 'react';

interface Site {
  id: string;
  slug: string;
  title: string;
  description: string;
  theme: string;
  is_public: boolean;
  created_at: string;
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list().then((r) => r.data.data as Site[]),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ slug: '', title: '', description: '' });

  const createMutation = useMutation({
    mutationFn: () => sitesApi.create(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      setShowCreate(false);
      setForm({ slug: '', title: '', description: '' });
    },
  });

  if (isLoading) {
    return <div className="text-center py-20 text-slate-400">読み込み中...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">マイサイト</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          + 新規サイト作成
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
          <h2 className="font-semibold mb-4">新規サイト作成</h2>
          <div className="space-y-3">
            <input
              placeholder="サイト名"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder="スラッグ (例: my-site)"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder="説明 (任意)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                作成
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 bg-slate-200 rounded-lg text-sm"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.map((site) => (
          <Link
            key={site.id}
            href={`/dashboard/sites/${site.id}`}
            className="bg-white rounded-2xl shadow-sm border p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-lg">{site.title}</h2>
                <p className="text-sm text-slate-500 mt-1">{site.slug}.klados.app</p>
                {site.description && (
                  <p className="text-sm text-slate-600 mt-2">{site.description}</p>
                )}
              </div>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  site.is_public ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {site.is_public ? '公開中' : '非公開'}
              </span>
            </div>
          </Link>
        ))}
        {data?.length === 0 && (
          <div className="col-span-3 text-center py-20 text-slate-400">
            サイトがまだありません。最初のサイトを作成しましょう！
          </div>
        )}
      </div>
    </div>
  );
}

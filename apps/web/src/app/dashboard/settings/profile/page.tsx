'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/lib/api';
import {
  User,
  Mail,
  Shield,
  KeyRound,
  Check,
  AlertCircle,
  ArrowLeft,
  Save,
  Lock,
  Camera,
  Upload,
  Loader2,
} from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';

export default function ProfileSettingsPage() {
  const t = useTranslations('profile');
  const { user, updateUser } = useAuthStore();

  // プロフィール編集 state
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // パスワード変更 state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || '');
      setAvatarUrl(user.avatar_url || '');
    }
  }, [user]);

  // アバター画像アップロード処理
  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setProfileError(t('avatar_error_type'));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setProfileError(t('avatar_error_size'));
      return;
    }

    setAvatarUploading(true);
    setProfileError('');
    setProfileSuccess('');

    try {
      const res = await authApi.uploadAvatar(file);
      const newUrl = res.data?.data?.avatar_url;
      if (newUrl) {
        setAvatarUrl(newUrl);
        updateUser({ avatar_url: newUrl });
        setProfileSuccess(t('avatar_success'));
        setTimeout(() => setProfileSuccess(''), 4000);
      }
    } catch (err: any) {
      setProfileError(err?.response?.data?.error || t('avatar_error_upload'));
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
    }
  };

  // プロフィール更新処理
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileSuccess('');
    setProfileError('');

    try {
      const res = await authApi.updateProfile({
        display_name: displayName,
        avatar_url: avatarUrl,
      });
      const updated = res.data?.data;
      if (updated) {
        updateUser({
          display_name: updated.display_name,
          avatar_url: updated.avatar_url,
        });
      }
      setProfileSuccess(t('profile_success'));
      setTimeout(() => setProfileSuccess(''), 4000);
    } catch (err: any) {
      setProfileError(err?.response?.data?.error || t('profile_error'));
    } finally {
      setProfileLoading(false);
    }
  };

  // パスワード変更処理
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordLoading(true);
    setPasswordSuccess('');
    setPasswordError('');

    if (newPassword.length < 8) {
      setPasswordError(t('password_too_short'));
      setPasswordLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(t('password_mismatch'));
      setPasswordLoading(false);
      return;
    }

    try {
      await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordSuccess(t('password_success'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(''), 4000);
    } catch (err: any) {
      setPasswordError(err?.response?.data?.error || t('password_error'));
    } finally {
      setPasswordLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* ページヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5">
            <Link href="/dashboard" className="hover:text-blue-600 transition-colors inline-flex items-center gap-1">
              <ArrowLeft className="size-3" /> {t('breadcrumb_dashboard')}
            </Link>
            <span>/</span>
            <span>{t('breadcrumb_settings')}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            {t('page_title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('page_desc')}
          </p>
        </div>

      </div>

      {/* 2カラム構成 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* 左カラム: アカウント概要カード */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs text-center space-y-4">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleAvatarFileSelect}
              className="hidden"
            />

            <div className="relative group mx-auto size-24">
              <UserAvatar
                src={avatarUrl}
                name={displayName || user.username}
                size="xl"
                className="border-2 border-white ring-2 ring-slate-200"
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute inset-0 rounded-full bg-black/40 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-xs"
                title={t('avatar_change')}
              >
                {avatarUploading ? (
                  <Loader2 className="size-6 animate-spin" />
                ) : (
                  <>
                    <Camera className="size-5" />
                    <span className="text-[10px] font-medium mt-0.5">{t('avatar_change')}</span>
                  </>
                )}
              </button>
            </div>

            <div>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200/80 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer"
              >
                {avatarUploading ? (
                  <Loader2 className="size-3 animate-spin text-blue-600" />
                ) : (
                  <Upload className="size-3 text-blue-600" />
                )}
                <span>{avatarUploading ? t('avatar_uploading') : t('avatar_upload')}</span>
              </button>
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {displayName || user.username}
              </h2>
              <p className="text-xs text-slate-500">@{user.username}</p>
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center justify-center gap-1.5 text-xs text-slate-600">
              <Mail className="size-3.5 text-slate-400" />
              <span className="truncate max-w-[200px]">{user.email}</span>
            </div>
          </div>

          <div className="bg-slate-100/70 rounded-2xl p-4 text-xs text-slate-600 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <Shield className="size-4 text-emerald-600" />
              <span>{t('security_title')}</span>
            </div>
            <p className="leading-relaxed">
              {t('security_desc')}
            </p>
          </div>
        </div>

        {/* 右カラム: プロフィール編集 & パスワード変更フォーム */}
        <div className="md:col-span-2 space-y-8">
          {/* 1. プロフィール基本設定 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
              <User className="size-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">{t('edit_section_title')}</h2>
            </div>

            {profileSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <Check className="size-4 text-emerald-600 shrink-0" />
                <span>{profileSuccess}</span>
              </div>
            )}

            {profileError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="size-4 text-rose-600 shrink-0" />
                <span>{profileError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {t('display_name_label')}
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('display_name_placeholder')}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {t('display_name_hint')}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {t('username_label')}
                </label>
                <input
                  type="text"
                  disabled
                  value={user.username}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {t('username_hint')}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {t('email_label')}
                </label>
                <input
                  type="email"
                  disabled
                  value={user.email}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={profileLoading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  <Save className="size-3.5" />
                  <span>{profileLoading ? t('saving_profile') : t('save_profile')}</span>
                </button>
              </div>
            </form>
          </div>

          {/* 2. パスワード変更 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
              <Lock className="size-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-900">{t('password_section_title')}</h2>
            </div>

            {passwordSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <Check className="size-4 text-emerald-600 shrink-0" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            {passwordError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="size-4 text-rose-600 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {t('current_password')}
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {t('new_password')}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('new_password_placeholder')}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {t('confirm_password')}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('confirm_password_placeholder')}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  <KeyRound className="size-3.5" />
                  <span>{passwordLoading ? t('changing_password') : t('change_password')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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
  Sparkles,
  Save,
  Lock,
} from 'lucide-react';

export default function ProfileSettingsPage() {
  const { user, updateUser } = useAuthStore();

  // プロフィール編集 state
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

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
      setProfileSuccess('プロフィールを更新しました！');
      setTimeout(() => setProfileSuccess(''), 4000);
    } catch (err: any) {
      setProfileError(err?.response?.data?.error || 'プロフィールの更新に失敗しました');
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
      setPasswordError('新しいパスワードは8文字以上で入力してください');
      setPasswordLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('新しいパスワードと確認用パスワードが一致しません');
      setPasswordLoading(false);
      return;
    }

    try {
      await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordSuccess('パスワードを正常に変更しました！');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(''), 4000);
    } catch (err: any) {
      setPasswordError(err?.response?.data?.error || 'パスワードの変更に失敗しました');
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
              <ArrowLeft className="size-3" /> ダッシュボード
            </Link>
            <span>/</span>
            <span>個人設定</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            アカウント・個人設定
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            プロフィール情報の確認・編集やセキュリティ設定を管理できます。
          </p>
        </div>

        {/* プランバッジ */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
            <Sparkles className="size-3 text-blue-600" />
            {user.plan} プラン
          </span>
        </div>
      </div>

      {/* 2カラム構成 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* 左カラム: アカウント概要カード */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs text-center space-y-4">
            <div className="size-20 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-3xl font-extrabold mx-auto shadow-md">
              {(displayName || user.username || 'U').charAt(0).toUpperCase()}
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
              <span>セキュリティ状態</span>
            </div>
            <p className="leading-relaxed">
              パスワードは安全に bcrypt によりハッシュ化されて保存されています。
            </p>
          </div>
        </div>

        {/* 右カラム: プロフィール編集 & パスワード変更フォーム */}
        <div className="md:col-span-2 space-y-8">
          {/* 1. プロフィール基本設定 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
              <User className="size-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">プロフィール編集</h2>
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
                  表示名 (Display Name)
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="例: 山田太郎 / Alex"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  サイトヘッダーやコメント投稿時に表示される名前です。
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  ユーザー名 (Username)
                </label>
                <input
                  type="text"
                  disabled
                  value={user.username}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  ログインやシステム内部識別用IDです（変更不可）。
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  メールアドレス
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
                  <span>{profileLoading ? '保存中...' : 'プロフィールを保存'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* 2. パスワード変更 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
              <Lock className="size-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-900">パスワード変更</h2>
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
                  現在のパスワード
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
                  新しいパスワード (8文字以上)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="8文字以上の新しいパスワード"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  新しいパスワードの確認
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="もう一度入力"
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
                  <span>{passwordLoading ? '変更中...' : 'パスワードを変更'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

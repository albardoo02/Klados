'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sitesApi, membersApi, SiteMemberItem, SiteRole, SitePermissions } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Edit3,
  Trash2,
  Check,
  Loader2,
  AlertCircle,
  ArrowLeft,
  FileText,
  BarChart3,
  Settings,
  Sliders,
  LogOut,
  X,
  Mail,
  User,
  Info,
} from 'lucide-react';

const PERMISSION_DEFINITIONS = [
  {
    key: 'can_edit_pages',
    label: 'ページ作成・編集',
    description: 'ドキュメントや記事の作成、下書き保存、既存ページの編集を許可します',
  },
  {
    key: 'can_publish_pages',
    label: 'ページ公開・非公開',
    description: 'ページの公開状態（公開／下書き）の切り替えを許可します',
  },
  {
    key: 'can_delete_pages',
    label: 'ページ削除',
    description: 'ページのゴミ箱への移動および削除を許可します',
  },
  {
    key: 'can_manage_settings',
    label: 'サイト設定変更',
    description: 'サイト名、テーマ、カスタムドメイン、OGPなどの設定変更を許可します',
  },
  {
    key: 'can_invite_members',
    label: 'メンバー招待・権限管理',
    description: '新しい共同編集者の招待や権限の割り当てを許可します',
  },
  {
    key: 'can_manage_media',
    label: 'メディア管理',
    description: '画像やメディアファイルのアップロードおよび削除を許可します',
  },
] as const;

export default function SiteMembersPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState<SiteMemberItem | null>(null);
  const [deletingMember, setDeletingMember] = useState<SiteMemberItem | null>(null);

  // 招待フォーム
  const [addForm, setAddForm] = useState<{
    identifier: string;
    role: SiteRole;
    permissions: SitePermissions;
  }>({
    identifier: '',
    role: 'editor',
    permissions: {
      can_edit_pages: true,
      can_publish_pages: true,
      can_delete_pages: false,
      can_manage_settings: false,
      can_invite_members: false,
      can_manage_media: true,
    },
  });
  const [addError, setAddError] = useState<string | null>(null);

  // 権限編集フォーム
  const [editForm, setEditForm] = useState<{
    role: SiteRole;
    permissions: SitePermissions;
  }>({
    role: 'editor',
    permissions: {
      can_edit_pages: true,
      can_publish_pages: true,
      can_delete_pages: false,
      can_manage_settings: false,
      can_invite_members: false,
      can_manage_media: true,
    },
  });
  const [editError, setEditError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // サイト情報取得
  const { data: site } = useQuery({
    queryKey: ['site', id],
    queryFn: () => sitesApi.get(id).then((r) => r.data.data),
  });

  // メンバー一覧取得
  const {
    data: members = [],
    isLoading,
    isError,
  } = useQuery<SiteMemberItem[]>({
    queryKey: ['site-members', id],
    queryFn: () => membersApi.list(id).then((r) => r.data.data as SiteMemberItem[]),
  });

  // 現在のユーザーのロール・権限を特定
  const currentMemberRecord = members.find((m) => m.user_id === currentUser?.id);
  const isOwner = site?.is_owner || site?.user_id === currentUser?.id;
  const isAdmin = currentMemberRecord?.role === 'admin';
  const canInvite =
    isOwner ||
    isAdmin ||
    Boolean(currentMemberRecord?.permissions?.can_invite_members);

  // メンバー追加 Mutation
  const addMutation = useMutation({
    mutationFn: () =>
      membersApi.add(id, {
        identifier: addForm.identifier.trim(),
        role: addForm.role,
        permissions: addForm.role === 'custom' ? addForm.permissions : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-members', id] });
      setShowAddModal(false);
      setAddForm({
        identifier: '',
        role: 'editor',
        permissions: {
          can_edit_pages: true,
          can_publish_pages: true,
          can_delete_pages: false,
          can_manage_settings: false,
          can_invite_members: false,
          can_manage_media: true,
        },
      });
      setAddError(null);
      showToast('メンバーを追加しました！');
    },
    onError: (err: any) => {
      setAddError(err?.response?.data?.error || 'メンバーの追加に失敗しました');
    },
  });

  // メンバー権限更新 Mutation
  const updateMutation = useMutation({
    mutationFn: (memberId: string) =>
      membersApi.update(id, memberId, {
        role: editForm.role,
        permissions: editForm.role === 'custom' ? editForm.permissions : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-members', id] });
      setEditingMember(null);
      setEditError(null);
      showToast('メンバーの権限を更新しました');
    },
    onError: (err: any) => {
      setEditError(err?.response?.data?.error || '権限の更新に失敗しました');
    },
  });

  // メンバー削除 Mutation
  const removeMutation = useMutation({
    mutationFn: (memberId: string) => membersApi.remove(id, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-members', id] });
      setDeletingMember(null);
      showToast('メンバーをサイトから除外しました');
    },
    onError: (err: any) => {
      alert(err?.response?.data?.error || 'メンバーの削除に失敗しました');
    },
  });

  const handleOpenEdit = (member: SiteMemberItem) => {
    setEditingMember(member);
    setEditError(null);
    setEditForm({
      role: member.role,
      permissions: {
        can_edit_pages: Boolean(member.permissions?.can_edit_pages),
        can_publish_pages: Boolean(member.permissions?.can_publish_pages),
        can_delete_pages: Boolean(member.permissions?.can_delete_pages),
        can_manage_settings: Boolean(member.permissions?.can_manage_settings),
        can_invite_members: Boolean(member.permissions?.can_invite_members),
        can_manage_media: Boolean(member.permissions?.can_manage_media),
      },
    });
  };

  const getRoleBadge = (role: SiteRole, isOwnerBadge: boolean) => {
    if (isOwnerBadge) {
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-900">
          <ShieldCheck className="size-3.5 text-blue-600 dark:text-blue-400" />
          オーナー
        </span>
      );
    }
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 font-semibold border border-purple-200 dark:border-purple-900">
            <Shield className="size-3.5 text-purple-600 dark:text-purple-400" />
            管理者
          </span>
        );
      case 'editor':
        return (
          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-900">
            <Edit3 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            編集者
          </span>
        );
      case 'viewer':
        return (
          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700">
            閲覧者
          </span>
        );
      case 'custom':
        return (
          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-900">
            <Sliders className="size-3.5 text-amber-600 dark:text-amber-400" />
            自由権限
          </span>
        );
      default:
        return (
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {role}
          </span>
        );
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-20">
      {/* 成功トースト */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in-0 slide-in-from-top-2">
          <Check className="size-4 text-emerald-400 dark:text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* サイト上部ヘッダー */}
      <div className="mb-6">
        <Link
          href={`/dashboard/sites/${id}`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors mb-3"
        >
          <ArrowLeft className="size-3.5" />
          <span>サイト管理に戻る</span>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                <Users className="size-6 text-blue-600 dark:text-blue-400" />
                <span>メンバー管理</span>
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 font-bold">
                {members.length} 名
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {site?.title} の共同編集者、管理者、閲覧メンバーの招待および権限設定
            </p>
          </div>

          {canInvite && (
            <button
              type="button"
              onClick={() => {
                setAddError(null);
                setShowAddModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors cursor-pointer"
            >
              <UserPlus className="size-4" />
              <span>メンバーを追加</span>
            </button>
          )}
        </div>

        {/* タブナビゲーション */}
        <div className="flex items-center gap-2 mt-6 border-b border-slate-200 dark:border-slate-800 text-sm overflow-x-auto">
          <Link
            href={`/dashboard/sites/${id}`}
            className="flex items-center gap-2 px-4 py-2.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors border-b-2 border-transparent shrink-0"
          >
            <FileText className="size-4" />
            <span>ページ一覧</span>
          </Link>
          <Link
            href={`/dashboard/sites/${id}/analytics`}
            className="flex items-center gap-2 px-4 py-2.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors border-b-2 border-transparent shrink-0"
          >
            <BarChart3 className="size-4" />
            <span>アクセス解析</span>
          </Link>
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2.5 font-semibold text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 shrink-0"
          >
            <Users className="size-4" />
            <span>メンバー管理 ({members.length})</span>
          </button>
          <Link
            href={`/dashboard/sites/${id}/settings`}
            className="flex items-center gap-2 px-4 py-2.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors border-b-2 border-transparent shrink-0"
          >
            <Settings className="size-4" />
            <span>設定</span>
          </Link>
        </div>
      </div>

      {/* メンバー権限の概要説明 */}
      <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-start gap-3 text-xs text-slate-600 dark:text-slate-400">
        <Info className="size-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-800 dark:text-slate-200">
            ロールと個別権限について
          </p>
          <p>
            <strong>管理者:</strong> ページの編集・公開・削除、設定変更、メンバー招待など全権限を保有します。
            <br />
            <strong>編集者:</strong> ページの作成・編集・公開およびメディア管理が可能です（設定やメンバー変更は不可）。
            <br />
            <strong>閲覧者:</strong> サイトの閲覧のみ許可されます。
            <br />
            <strong>自由権限 (カスタム):</strong> ページ作成や公開、削除、設定管理などをチェックボックスで個別に柔軟に設定できます。
          </p>
        </div>
      </div>

      {/* メンバー一覧 */}
      {isLoading ? (
        <div className="text-center py-20 text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="size-5 animate-spin" />
          <span>メンバー一覧を読み込み中...</span>
        </div>
      ) : isError ? (
        <div className="p-8 text-center bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-2xl text-rose-600 dark:text-rose-400">
          <AlertCircle className="size-8 mx-auto mb-2" />
          <p className="font-semibold">メンバー情報の取得に失敗しました</p>
          <p className="text-xs mt-1">権限がないか、通信エラーが発生しました。</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs divide-y divide-slate-100 dark:divide-slate-800">
          {members.map((member) => {
            const isMe = member.user_id === currentUser?.id;
            const isMemberOwner = member.is_owner;
            const canModifyThisMember =
              (isOwner || isAdmin) && !isMemberOwner && (!isAdmin || member.role !== 'admin');

            return (
              <div
                key={member.id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
              >
                {/* ユーザープロフィール情報 */}
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="relative shrink-0">
                    {member.user?.avatar_url ? (
                      <img
                        src={member.user.avatar_url}
                        alt={member.user.display_name || member.user.username}
                        className="w-11 h-11 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                        {(member.user?.display_name || member.user?.username || 'U')[0].toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">
                        {member.user?.display_name || member.user?.username || '名称未設定'}
                      </span>
                      {isMe && (
                        <span className="text-[10px] px-2 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-700">
                          あなた
                        </span>
                      )}
                      {getRoleBadge(member.role, isMemberOwner)}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1 font-mono">
                        @{member.user?.username}
                      </span>
                      {member.user?.email && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 truncate max-w-[200px] sm:max-w-none">
                            <Mail className="size-3" />
                            {member.user.email}
                          </span>
                        </>
                      )}
                    </div>

                    {/* カスタム権限の場合の個別バッジ表示 */}
                    {member.role === 'custom' && member.permissions && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {member.permissions.can_edit_pages && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                            ページ編集
                          </span>
                        )}
                        {member.permissions.can_publish_pages && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-medium">
                            公開可能
                          </span>
                        )}
                        {member.permissions.can_delete_pages && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 font-medium">
                            削除可能
                          </span>
                        )}
                        {member.permissions.can_manage_settings && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 font-medium">
                            サイト設定
                          </span>
                        )}
                        {member.permissions.can_invite_members && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 font-medium">
                            メンバー招待
                          </span>
                        )}
                        {member.permissions.can_manage_media && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-400 font-medium">
                            メディア
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* アクションボタン */}
                <div className="flex items-center gap-2 self-end sm:self-center">
                  {isMemberOwner ? (
                    <span className="text-xs text-slate-400 italic px-2 py-1 select-none">
                      オーナー権限
                    </span>
                  ) : (
                    <>
                      {canModifyThisMember && (
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(member)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors shadow-2xs cursor-pointer"
                        >
                          <Edit3 className="size-3.5 text-slate-500" />
                          <span>権限変更</span>
                        </button>
                      )}

                      {/* 削除または退会ボタン */}
                      {canModifyThisMember ? (
                        <button
                          type="button"
                          onClick={() => setDeletingMember(member)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer"
                          title="サイトから除外"
                        >
                          <Trash2 className="size-3.5" />
                          <span>削除</span>
                        </button>
                      ) : isMe && !isMemberOwner ? (
                        <button
                          type="button"
                          onClick={() => setDeletingMember(member)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900 transition-colors cursor-pointer"
                        >
                          <LogOut className="size-3.5" />
                          <span>このサイトから退会</span>
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- モーダル1: メンバーを追加 --- */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in-0 zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 font-bold text-base text-slate-900 dark:text-white">
                <UserPlus className="size-5 text-blue-600 dark:text-blue-400" />
                <span>新しいメンバーを追加</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="size-5" />
              </button>
            </div>

            {addError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              {/* ユーザー指定 */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  ユーザー名 または メールアドレス <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={addForm.identifier}
                  onChange={(e) => setAddForm({ ...addForm, identifier: e.target.value })}
                  placeholder="例: user@example.com または klados_writer"
                  className="w-full px-3.5 py-2.5 text-sm bg-background border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-400">
                  Kladosに登録済みのユーザーのメールアドレスまたはユーザー名を入力してください。
                </p>
              </div>

              {/* ロール選択 */}
              <div className="space-y-2">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  ロール (役割) <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAddForm({ ...addForm, role: 'editor' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      addForm.role === 'editor'
                        ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 ring-1 ring-blue-600'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      <Edit3 className="size-3.5 text-emerald-600" />
                      編集者
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      ページ作成・編集・公開、メディア追加
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAddForm({ ...addForm, role: 'admin' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      addForm.role === 'admin'
                        ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 ring-1 ring-blue-600'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      <Shield className="size-3.5 text-purple-600" />
                      管理者
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      サイト設定・メンバー管理を含む全権限
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAddForm({ ...addForm, role: 'viewer' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      addForm.role === 'viewer'
                        ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 ring-1 ring-blue-600'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      <User className="size-3.5 text-slate-600" />
                      閲覧者
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      非公開プレビュー・コンテンツの閲覧のみ
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAddForm({ ...addForm, role: 'custom' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      addForm.role === 'custom'
                        ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 ring-1 ring-blue-600'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      <Sliders className="size-3.5 text-amber-600" />
                      自由権限 (個別設定)
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      各操作権限をチェックボックスで指定
                    </div>
                  </button>
                </div>
              </div>

              {/* カスタム権限指定チェックボックス */}
              {addForm.role === 'custom' && (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5 animate-in fade-in-0">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 pb-1 border-b border-slate-200 dark:border-slate-700 flex items-center gap-1.5">
                    <Sliders className="size-3.5 text-blue-600" />
                    <span>許可する操作を個別に選択</span>
                  </div>
                  <div className="space-y-2">
                    {PERMISSION_DEFINITIONS.map((perm) => (
                      <label
                        key={perm.key}
                        className="flex items-start gap-2.5 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(addForm.permissions[perm.key])}
                          onChange={(e) =>
                            setAddForm({
                              ...addForm,
                              permissions: {
                                ...addForm.permissions,
                                [perm.key]: e.target.checked,
                              },
                            })
                          }
                          className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {perm.label}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {perm.description}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => addMutation.mutate()}
                disabled={addMutation.isPending || !addForm.identifier.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {addMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <UserPlus className="size-3.5" />
                )}
                <span>{addMutation.isPending ? '追加中...' : 'メンバーを追加'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- モーダル2: 権限変更 --- */}
      {editingMember && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in-0 zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 font-bold text-base text-slate-900 dark:text-white">
                <Edit3 className="size-5 text-blue-600 dark:text-blue-400" />
                <span>メンバー権限の変更</span>
              </div>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
                {(editingMember.user?.display_name || editingMember.user?.username || 'U')[0].toUpperCase()}
              </div>
              <div>
                <div className="font-bold text-xs text-slate-900 dark:text-white">
                  {editingMember.user?.display_name || editingMember.user?.username}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  @{editingMember.user?.username} • {editingMember.user?.email}
                </div>
              </div>
            </div>

            {editError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              <div className="space-y-2">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  ロール (役割)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, role: 'editor' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      editForm.role === 'editor'
                        ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 ring-1 ring-blue-600'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      <Edit3 className="size-3.5 text-emerald-600" />
                      編集者
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      ページ作成・編集・公開
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, role: 'admin' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      editForm.role === 'admin'
                        ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 ring-1 ring-blue-600'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      <Shield className="size-3.5 text-purple-600" />
                      管理者
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      設定・メンバー管理を含む全権限
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, role: 'viewer' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      editForm.role === 'viewer'
                        ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 ring-1 ring-blue-600'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      <User className="size-3.5 text-slate-600" />
                      閲覧者
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      コンテンツの閲覧のみ
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, role: 'custom' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      editForm.role === 'custom'
                        ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 ring-1 ring-blue-600'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      <Sliders className="size-3.5 text-amber-600" />
                      自由権限 (個別設定)
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      個別チェックボックス指定
                    </div>
                  </button>
                </div>
              </div>

              {/* カスタム権限指定チェックボックス */}
              {editForm.role === 'custom' && (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5 animate-in fade-in-0">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 pb-1 border-b border-slate-200 dark:border-slate-700 flex items-center gap-1.5">
                    <Sliders className="size-3.5 text-blue-600" />
                    <span>許可する操作を個別に選択</span>
                  </div>
                  <div className="space-y-2">
                    {PERMISSION_DEFINITIONS.map((perm) => (
                      <label
                        key={perm.key}
                        className="flex items-start gap-2.5 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(editForm.permissions[perm.key])}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              permissions: {
                                ...editForm.permissions,
                                [perm.key]: e.target.checked,
                              },
                            })
                          }
                          className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {perm.label}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {perm.description}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => updateMutation.mutate(editingMember.id)}
                disabled={updateMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                <span>{updateMutation.isPending ? '保存中...' : '変更を保存'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- モーダル3: 削除・退会確認 --- */}
      {deletingMember && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in-0 zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2 bg-rose-100 dark:bg-rose-950/60 rounded-xl">
                <ShieldAlert className="size-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {deletingMember.user_id === currentUser?.id
                  ? 'サイトから退会しますか？'
                  : 'メンバーを除外しますか？'}
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {deletingMember.user_id === currentUser?.id
                ? 'このサイトの共同編集グループから退会します。退会後は、再度招待されるまで管理画面へのアクセスができなくなります。'
                : `「${deletingMember.user?.display_name || deletingMember.user?.username}」をこのサイトのメンバーから除外します。除外されたユーザーはこのサイトの管理ができなくなります。`}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingMember(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => removeMutation.mutate(deletingMember.id)}
                disabled={removeMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {removeMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                <span>
                  {removeMutation.isPending
                    ? '処理中...'
                    : deletingMember.user_id === currentUser?.id
                    ? '退会する'
                    : '除外する'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

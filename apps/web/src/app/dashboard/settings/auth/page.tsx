'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  authApi,
  sitesApi,
  AuthConfig,
  AuthRoutingRule,
  AppliedRuleResult,
} from '@/lib/api';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import {
  ShieldCheck,
  Plus,
  ArrowLeft,
  Trash2,
  Edit2,
  Check,
  AlertTriangle,
  Loader2,
  Sparkles,
  Play,
  Building,
  Mail,
  HelpCircle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Crown,
  Lock,
  Copy,
  KeyRound,
} from 'lucide-react';

interface SiteItem {
  id: string;
  title: string;
  slug: string;
}

export default function AuthSettingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  // 認証設定の取得
  const { data: configData, isLoading: isConfigLoading } = useQuery({
    queryKey: ['auth-config'],
    queryFn: () => authApi.getAuthConfig().then((res) => res.data.data),
  });

  // 振り分けルール一覧の取得
  const { data: rules = [], isLoading: isRulesLoading } = useQuery<AuthRoutingRule[]>({
    queryKey: ['auth-routing-rules'],
    queryFn: () => authApi.getRoutingRules().then((res) => res.data.data),
  });

  // ユーザーのサイト一覧の取得（振り分け先選択用）
  const { data: sites = [] } = useQuery<SiteItem[]>({
    queryKey: ['user-sites-list'],
    queryFn: () => sitesApi.list().then((res) => res.data.data),
  });

  // 設定フォーム状態
  const [requireEmail, setRequireEmail] = useState<boolean | null>(null);
  const [allowEmailRegistration, setAllowEmailRegistration] = useState<boolean>(true);
  const [enableEmailLogin, setEnableEmailLogin] = useState<boolean>(true);
  const [enableGithubLogin, setEnableGithubLogin] = useState<boolean>(true);
  const [enableDiscordLogin, setEnableDiscordLogin] = useState<boolean>(true);
  const [enableGoogleLogin, setEnableGoogleLogin] = useState<boolean>(true);
  const [enableDemoLogin, setEnableDemoLogin] = useState<boolean>(true);
  const [onlyRootCanCreateSites, setOnlyRootCanCreateSites] = useState<boolean>(true);
  const [defaultRole, setDefaultRole] = useState<string>('viewer');
  const [allowedDomains, setAllowedDomains] = useState<string>('');
  const [restrictToRules, setRestrictToRules] = useState<boolean>(false);
  const [githubClientId, setGithubClientId] = useState<string>('');
  const [githubClientSecret, setGithubClientSecret] = useState<string>('');
  const [discordClientId, setDiscordClientId] = useState<string>('');
  const [discordClientSecret, setDiscordClientSecret] = useState<string>('');
  const [copiedCallback, setCopiedCallback] = useState<string | null>(null);
  const [configSuccessMsg, setConfigSuccessMsg] = useState<string | null>(null);

  // 初期値反映
  React.useEffect(() => {
    if (configData?.config) {
      if (requireEmail === null) {
        setRequireEmail(configData.config.require_email_verification);
        setAllowEmailRegistration(configData.config.allow_email_registration ?? true);
        setEnableEmailLogin(configData.config.enable_email_login ?? true);
        setEnableGithubLogin(configData.config.enable_github_login ?? true);
        setEnableDiscordLogin(configData.config.enable_discord_login ?? true);
        setEnableGoogleLogin(configData.config.enable_google_login ?? true);
        setEnableDemoLogin(configData.config.enable_demo_login ?? true);
        setOnlyRootCanCreateSites(configData.config.only_root_can_create_sites ?? true);
        setDefaultRole(configData.config.default_role || 'viewer');
        setAllowedDomains(configData.config.allowed_domains || '');
        setRestrictToRules(configData.config.restrict_to_rules || false);
        setGithubClientId(configData.config.github_client_id || '');
        setDiscordClientId(configData.config.discord_client_id || '');
      }
    }
  }, [configData, requireEmail]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCallback(key);
    setTimeout(() => setCopiedCallback(null), 2000);
  };

  // 設定更新ミューテーション
  const updateConfigMutation = useMutation({
    mutationFn: (data: Partial<AuthConfig>) => authApi.updateAuthConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-config'] });
      setConfigSuccessMsg('認証・システム設定を正常に保存しました！');
      setTimeout(() => setConfigSuccessMsg(null), 3500);
    },
  });

  const handleSaveConfig = () => {
    updateConfigMutation.mutate({
      require_email_verification: requireEmail ?? false,
      allow_email_registration: allowEmailRegistration,
      enable_email_login: enableEmailLogin,
      enable_github_login: enableGithubLogin,
      enable_discord_login: enableDiscordLogin,
      enable_google_login: enableGoogleLogin,
      enable_demo_login: enableDemoLogin,
      only_root_can_create_sites: onlyRootCanCreateSites,
      default_role: defaultRole,
      allowed_domains: allowedDomains,
      restrict_to_rules: restrictToRules,
      github_client_id: githubClientId,
      github_client_secret: githubClientSecret || undefined,
      discord_client_id: discordClientId,
      discord_client_secret: discordClientSecret || undefined,
    });
  };

  // アジ鯖公式Wiki推奨プリセットを適用
  const applyAzisabaPreset = () => {
    setOnlyRootCanCreateSites(true);
    setEnableEmailLogin(false);
    setAllowEmailRegistration(false);
    setEnableDemoLogin(false);
    setEnableGoogleLogin(false);
    setEnableGithubLogin(true);
    setEnableDiscordLogin(true);
    setRestrictToRules(true);
    setRequireEmail(false);
    setConfigSuccessMsg('アジ鯖公式Wiki推奨プリセットをフォームに反映しました。「設定を保存する」をクリックして確定してください。');
    setTimeout(() => setConfigSuccessMsg(null), 6000);
  };

  // ルール作成/編集モーダル
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AuthRoutingRule | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [provider, setProvider] = useState<'all' | 'google' | 'github' | 'discord' | 'email'>('all');
  const [ruleType, setRuleType] = useState<'github_org' | 'discord_guild' | 'email_domain' | 'email_list'>('github_org');
  const [matchValue, setMatchValue] = useState('');
  const [targetSiteId, setTargetSiteId] = useState<string>('');
  const [targetRole, setTargetRole] = useState<'admin' | 'editor' | 'viewer'>('editor');
  const [autoVerify, setAutoVerify] = useState(true);

  const openCreateModal = () => {
    setEditingRule(null);
    setRuleName('');
    setProvider('github');
    setRuleType('github_org');
    setMatchValue('');
    setTargetSiteId(sites.length > 0 ? sites[0].id : '');
    setTargetRole('editor');
    setAutoVerify(true);
    setModalOpen(true);
  };

  const openEditModal = (rule: AuthRoutingRule) => {
    setEditingRule(rule);
    setRuleName(rule.name);
    setProvider(rule.provider);
    setRuleType(rule.rule_type);
    setMatchValue(rule.match_value);
    setTargetSiteId(rule.target_site_id || '');
    setTargetRole(rule.target_role);
    setAutoVerify(rule.auto_verify);
    setModalOpen(true);
  };

  // ルール保存ミューテーション
  const saveRuleMutation = useMutation({
    mutationFn: (data: Partial<AuthRoutingRule>) => {
      if (editingRule) {
        return authApi.updateRoutingRule(editingRule.id, data);
      }
      return authApi.createRoutingRule(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-routing-rules'] });
      setModalOpen(false);
    },
  });

  const handleRuleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim() || !matchValue.trim()) return;

    saveRuleMutation.mutate({
      name: ruleName.trim(),
      provider,
      rule_type: ruleType,
      match_value: matchValue.trim(),
      action_type: targetSiteId ? 'assign_site_role' : 'none',
      target_site_id: targetSiteId || undefined,
      target_role: targetRole,
      auto_verify: autoVerify,
    });
  };

  // ルール削除ミューテーション
  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => authApi.deleteRoutingRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-routing-rules'] });
    },
  });

  // ルール有効/無効切り替え
  const toggleRuleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      authApi.updateRoutingRule(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-routing-rules'] });
    },
  });

  // シミュレーター
  const [testProvider, setTestProvider] = useState<'github' | 'discord' | 'google' | 'email'>('github');
  const [testEmail, setTestEmail] = useState('');
  const [testOrg, setTestOrg] = useState('');
  const [testGuildName, setTestGuildName] = useState('');
  const [testResults, setTestResults] = useState<{
    tested: boolean;
    matches: AppliedRuleResult[];
    auto_verified: boolean;
  } | null>(null);

  const testMutation = useMutation({
    mutationFn: (data: {
      provider: string;
      email: string;
      org?: string;
      guild_name?: string;
    }) => authApi.testRoutingRule(data),
    onSuccess: (res) => {
      setTestResults({
        tested: true,
        matches: res.data.data.matches,
        auto_verified: res.data.data.auto_verified,
      });
    },
  });

  const handleRunTest = (e: React.FormEvent) => {
    e.preventDefault();
    testMutation.mutate({
      provider: testProvider,
      email: testEmail.trim(),
      org: testOrg.trim() || undefined,
      guild_name: testGuildName.trim() || undefined,
    });
  };

  if (user && !user.is_root) {
    return (
      <div className="max-w-md mx-auto py-20 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
          <Lock className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">管理者権限（root）が必要です</h2>
        <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
          認証ポリシーや自動振り分けルールの設定は、システム管理者（root）のみアクセスできます。
        </p>
        <div className="pt-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            ダッシュボードへ戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      {/* ページヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 mb-1">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 hover:underline text-slate-500 hover:text-slate-800 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              ダッシュボードへ戻る
            </Link>
          </div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
              <ShieldCheck className="w-6 h-6 text-blue-600" />
              認証 & アクセス振り分け設定
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 shadow-2xs">
              <Crown className="w-3.5 h-3.5 text-amber-600" />
              root専用
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            メール認証の必須/任意モード切替、サイト新規作成制限、GitHub組織・Discordサーバーに応じたサイト自動所属を設定します。
          </p>
        </div>
      </div>

      {/* アジ鯖公式Wiki 推奨プリセット適用バナー */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-5 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-bold text-sm">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>アジ鯖公式Wiki クイック構成プリセット</span>
          </div>
          <p className="text-xs text-blue-100 max-w-xl">
            「Discord &amp; GitHub認証のみ許可」「メール・デモログインの完全遮断」「サイト新規作成をroot限定」をワンクリックで一括セットします。
          </p>
        </div>
        <button
          type="button"
          onClick={applyAzisabaPreset}
          className="px-4 py-2 bg-white text-blue-700 hover:bg-blue-50 text-xs font-bold rounded-xl shadow transition-all shrink-0 cursor-pointer flex items-center justify-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          推奨プリセットを適用
        </button>
      </div>

      {/* ログイン方法（プロバイダー）有効/無効カード */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Lock className="w-5 h-5 text-blue-600" />
            許可するログイン方法（認証プロバイダー）
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            ユーザーに提供するログイン方法を選択します。オフにしたログイン方法はログイン画面から非表示になり、APIでも遮断されます。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* GitHubログイン */}
          <div className="border border-slate-200 rounded-xl p-4 flex items-center justify-between bg-slate-50/50">
            <div>
              <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-800" />
                GitHub OAuth ログイン
              </span>
              <span className="text-[11px] text-slate-500 block">組織所属（GitHub Org）による振り分けに対応</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enableGithubLogin}
                onChange={(e) => setEnableGithubLogin(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Discordログイン */}
          <div className="border border-slate-200 rounded-xl p-4 flex items-center justify-between bg-slate-50/50">
            <div>
              <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#5865F2]" />
                Discord OAuth ログイン
              </span>
              <span className="text-[11px] text-slate-500 block">公式Discordサーバー所属による振り分けに対応</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enableDiscordLogin}
                onChange={(e) => setEnableDiscordLogin(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Googleログイン */}
          <div className="border border-slate-200 rounded-xl p-4 flex items-center justify-between bg-slate-50/50">
            <div>
              <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Google OAuth ログイン
              </span>
              <span className="text-[11px] text-slate-500 block">Googleアカウントでのワンタップログイン</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enableGoogleLogin}
                onChange={(e) => setEnableGoogleLogin(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* デモログイン */}
          <div className="border border-slate-200 rounded-xl p-4 flex items-center justify-between bg-slate-50/50">
            <div>
              <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                ワンクリック簡単ログイン (デモ体験)
              </span>
              <span className="text-[11px] text-slate-500 block">本番運用時はOFF（非表示・無効化）を推奨</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enableDemoLogin}
                onChange={(e) => setEnableDemoLogin(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* メール/パスワードログイン */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3 md:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  メールアドレス / パスワードログイン
                </span>
                <span className="text-[11px] text-slate-500 block">
                  オフにするとログイン画面からメール入力フォームが消え、Discord/GitHub等のOAuthのみに絞り込めます
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableEmailLogin}
                  onChange={(e) => setEnableEmailLogin(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* メール新規登録の許可/禁止（メールログイン有効時のみ） */}
            {enableEmailLogin && (
              <div className="pt-2.5 border-t border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-800 block">
                    メールアドレス新規登録（/register）の許可
                  </span>
                  <span className="text-[11px] text-slate-500">
                    オフにすると誰でもアカウントを勝手に作成できる穴を塞ぎます（招待制・既存ユーザー限定）
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowEmailRegistration}
                    onChange={(e) => setAllowEmailRegistration(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* OAuth アプリケーション接続設定（GitHub / Discord）カード */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-indigo-600" />
              OAuth アプリケーション接続設定（GitHub / Discord）
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              ソーシャルログイン（GitHub / Discord）を使用するための OAuth2 クライアント情報です。環境変数（Kubernetes Secret等）が優先され、未設定時はここで保存した値が利用されます。
            </p>
          </div>
          <button
            onClick={handleSaveConfig}
            disabled={updateConfigMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors disabled:opacity-50"
          >
            {updateConfigMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            OAuth設定を保存
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
          {/* GitHub OAuth 設定 */}
          <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/50 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 text-sm">GitHub OAuth App</span>
                {configData?.config.github_configured ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 設定完了
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full">
                    <AlertTriangle className="w-3.5 h-3.5" /> 未設定
                  </span>
                )}
              </div>
              <a
                href="https://github.com/settings/developers"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                GitHub Developer Settings <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Authorization callback URL (登録用)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={typeof window !== 'undefined' ? `${window.location.origin}/auth/callback?provider=github` : 'https://cms.azisaba.net/auth/callback?provider=github'}
                  className="w-full text-xs font-mono bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-600 select-all"
                />
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      typeof window !== 'undefined' ? `${window.location.origin}/auth/callback?provider=github` : 'https://cms.azisaba.net/auth/callback?provider=github',
                      'github_cb'
                    )
                  }
                  className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 shrink-0"
                >
                  {copiedCallback === 'github_cb' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCallback === 'github_cb' ? 'コピー済' : 'コピー'}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                GitHub の OAuth App 作成画面で上記 URL を「Authorization callback URL」に指定してください。
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Client ID
                </label>
                <input
                  type="text"
                  placeholder="Iv1.xxxxxxxxx or Ov23xxxxxxxx"
                  value={githubClientId}
                  onChange={(e) => setGithubClientId(e.target.value)}
                  className="w-full text-xs font-mono bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Client Secret
                </label>
                <input
                  type="password"
                  placeholder={configData?.config.github_configured ? '•••••••••••••••• (設定済み・変更時のみ入力)' : 'Client Secret を入力'}
                  value={githubClientSecret}
                  onChange={(e) => setGithubClientSecret(e.target.value)}
                  className="w-full text-xs font-mono bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Discord OAuth 設定 */}
          <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/50 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 text-sm">Discord OAuth2</span>
                {configData?.config.discord_configured ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 設定完了
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full">
                    <AlertTriangle className="w-3.5 h-3.5" /> 未設定
                  </span>
                )}
              </div>
              <a
                href="https://discord.com/developers/applications"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                Discord Developer Portal <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Redirect URI (登録用)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={typeof window !== 'undefined' ? `${window.location.origin}/auth/callback?provider=discord` : 'https://cms.azisaba.net/auth/callback?provider=discord'}
                  className="w-full text-xs font-mono bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-600 select-all"
                />
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      typeof window !== 'undefined' ? `${window.location.origin}/auth/callback?provider=discord` : 'https://cms.azisaba.net/auth/callback?provider=discord',
                      'discord_cb'
                    )
                  }
                  className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 shrink-0"
                >
                  {copiedCallback === 'discord_cb' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCallback === 'discord_cb' ? 'コピー済' : 'コピー'}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Discord Developer Portal の OAuth2 &gt; Redirects に上記 URL を追加してください。
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Client ID (Application ID)
                </label>
                <input
                  type="text"
                  placeholder="123456789012345678"
                  value={discordClientId}
                  onChange={(e) => setDiscordClientId(e.target.value)}
                  className="w-full text-xs font-mono bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Client Secret
                </label>
                <input
                  type="password"
                  placeholder={configData?.config.discord_configured ? '•••••••••••••••• (設定済み・変更時のみ入力)' : 'Client Secret を入力'}
                  value={discordClientSecret}
                  onChange={(e) => setDiscordClientSecret(e.target.value)}
                  className="w-full text-xs font-mono bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* メールアドレス認証 & サイト作成ポリシー設定カード */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Mail className="w-5 h-5 text-indigo-600" />
              セキュリティ &amp; サイト作成ポリシー
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              組織公式Wikiの運用に合わせ、一般ユーザーによるサイト乱立の防止やメール認証の要否を設定します。
            </p>
          </div>
          {configSuccessMsg && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold animate-in fade-in">
              <Check className="w-4 h-4" />
              {configSuccessMsg}
            </div>
          )}
        </div>

        {isConfigLoading ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* サイト新規作成ポリシー (root限定) */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/50 space-y-3 md:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Crown className="w-4 h-4 text-amber-500" />
                    サイト新規作成を root 管理者のみに制限
                  </span>
                  <span className="text-xs text-slate-500">
                    オン（推奨）：組織関係者による個人サイトの乱立を防止し、公式Wikiのみを運用
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyRootCanCreateSites}
                    onChange={(e) => setOnlyRootCanCreateSites(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div
                className={`text-xs p-3 rounded-xl border ${
                  onlyRootCanCreateSites
                    ? 'bg-blue-50 text-blue-900 border-blue-200'
                    : 'bg-amber-50 text-amber-900 border-amber-200'
                }`}
              >
                {onlyRootCanCreateSites ? (
                  <p className="text-[11px] leading-relaxed">
                    <strong>公式Wikiモード（アジ鯖専用）:</strong> 一般スタッフやメンバーのダッシュボードからは「新しいサイトを作成」ボタンが隠れ、API経由でも作成が拒否（403 Forbidden）されます。スタッフは招待・振り分けられた公式Wikiのみを編集できます。
                  </p>
                ) : (
                  <p className="text-[11px] leading-relaxed">
                    <strong>オープンSaaSモード:</strong> ログインしたすべてのユーザーが、個人で新しいサイト（Wiki）を自由に作成できます。
                  </p>
                )}
              </div>
            </div>

            {/* メール認証必須/任意トグル */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-slate-900 block">
                    メール確認を必須にする
                  </span>
                  <span className="text-xs text-slate-500">
                    オフ（推奨）：登録直後から即時利用可能（メール送信不要）
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireEmail ?? false}
                    onChange={(e) => setRequireEmail(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div
                className={`text-xs p-3 rounded-xl border ${
                  requireEmail
                    ? 'bg-amber-50 text-amber-900 border-amber-200'
                    : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                }`}
              >
                {requireEmail ? (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>本番セキュリティモード:</strong>
                      <p className="mt-0.5 text-[11px]">
                        ユーザーはメール受信内のリンクをクリックして確認を完了するまで未認証状態となります。SMTP等のメールサービス環境が必要です。
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>かんたん・開発モード（メール設定不要）:</strong>
                      <p className="mt-0.5 text-[11px]">
                        メールアドレス登録時、即座に認証済み状態（Email Verified: true）となり、メールサーバーの準備なしですぐに全ての機能が利用できます！
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ドメイン制限とデフォルトロール */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/50 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  ドメイン制限（ホワイトリスト）
                </label>
                <input
                  type="text"
                  placeholder="@company.com, @corp.net (空欄で全ドメイン許可)"
                  value={allowedDomains}
                  onChange={(e) => setAllowedDomains(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  指定されたドメイン以外のメールアドレスからの登録を遮断します。
                </p>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    ルール一致ユーザーのみログイン許可
                  </span>
                  <span className="text-[11px] text-slate-400">
                    下記の振り分けルールに合致するユーザーのみ利用を許可
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={restrictToRules}
                  onChange={(e) => setRestrictToRules(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={updateConfigMutation.isPending}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
          >
            {updateConfigMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            設定を保存する
          </button>
        </div>
      </div>

      {/* 振り分けルール（Auth Routing Rules） */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Building className="w-5 h-5 text-blue-600" />
              自動振り分けルール（GitHub Org / Discord サーバー / メール）
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              ログイン時、GitHub組織やDiscordサーバー、メールアドレスに基づいて、指定サイトの権限（管理者/編集者/閲覧者）を自動付与します。
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors shadow-sm self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            新規ルールを追加
          </button>
        </div>

        {/* ルール一覧テーブル */}
        {isRulesLoading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
          </div>
        ) : rules.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-3">
            <Building className="w-10 h-10 text-slate-400 mx-auto" />
            <h3 className="text-sm font-bold text-slate-700">ルールがまだ登録されていません</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              GitHubの社内OrganizationメンバーやDiscordの自鯖メンバーを、特定のサイトの編集者や閲覧者として自動所属させるルールを作成できます。
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-xl transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              ルールを作成してみる
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">有効</th>
                  <th className="px-4 py-3">ルール名</th>
                  <th className="px-4 py-3">プロバイダ</th>
                  <th className="px-4 py-3">判定条件</th>
                  <th className="px-4 py-3">振り分け先サイト</th>
                  <th className="px-4 py-3">付与ロール</th>
                  <th className="px-4 py-3">自動認証</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map((rule) => {
                  return (
                    <tr key={rule.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3.5">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={(e) =>
                              toggleRuleMutation.mutate({
                                id: rule.id,
                                enabled: e.target.checked,
                              })
                            }
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </td>
                      <td className="px-4 py-3.5 font-bold text-slate-900">
                        {rule.name}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 uppercase">
                          {rule.provider}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 text-[10px]">
                            {rule.rule_type === 'github_org' && 'GitHub Org:'}
                            {rule.rule_type === 'discord_guild' && 'Discord Guild:'}
                            {rule.rule_type === 'email_domain' && 'Domain:'}
                            {rule.rule_type === 'email_list' && 'Emails:'}
                          </span>
                          <span className="font-semibold text-slate-800">
                            {rule.match_value}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {rule.target_site ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-slate-800">
                              {rule.target_site.title}
                            </span>
                            <span className="text-slate-400 text-[10px]">
                              ({rule.target_site.slug})
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">なし（認証のみ）</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            rule.target_role === 'admin'
                              ? 'bg-purple-100 text-purple-700'
                              : rule.target_role === 'editor'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {rule.target_role}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {rule.auto_verify ? (
                          <span className="text-emerald-600 font-semibold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            自動認証
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right space-x-1 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEditModal(rule)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                          title="編集"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`ルール「${rule.name}」を削除しますか？`)) {
                              deleteRuleMutation.mutate(rule.id);
                            }
                          }}
                          className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 判定テスト・シミュレーター */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              振り分け判定シミュレーター
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              設定したルールが期待通りにマッチするか、仮想のログイン情報でテストできます。
            </p>
          </div>
        </div>

        <form onSubmit={handleRunTest} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              プロバイダ
            </label>
            <select
              value={testProvider}
              onChange={(e: any) => setTestProvider(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="github">GitHub</option>
              <option value="discord">Discord</option>
              <option value="google">Google</option>
              <option value="email">Email</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              メールアドレス
            </label>
            <input
              type="email"
              required
              placeholder="user@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {testProvider === 'github' ? (
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                GitHub 組織名 (Org)
              </label>
              <input
                type="text"
                placeholder="my-org"
                value={testOrg}
                onChange={(e) => setTestOrg(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ) : testProvider === 'discord' ? (
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Discord サーバー名 / Guild ID
              </label>
              <input
                type="text"
                placeholder="Developers Community"
                value={testGuildName}
                onChange={(e) => setTestGuildName(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ) : (
            <div className="text-xs text-slate-400 flex items-center pt-5">
              メールまたはドメインで判定されます
            </div>
          )}

          <div className="flex items-end">
            <button
              type="submit"
              disabled={testMutation.isPending || !testEmail.trim()}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {testMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              判定テスト実行
            </button>
          </div>
        </form>

        {testResults && (
          <div className="mt-4 p-4 border border-slate-200 rounded-xl bg-slate-50/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                テスト結果: マッチしたルール ({testResults.matches.length}件)
              </span>
              {testResults.auto_verified && (
                <span className="text-[11px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                  ✓ メール自動認証対象
                </span>
              )}
            </div>

            {testResults.matches.length === 0 ? (
              <p className="text-xs text-slate-500 italic">
                条件に一致する有効なルールはありませんでした（デフォルトロールが付与されます）。
              </p>
            ) : (
              <div className="space-y-2">
                {testResults.matches.map((match, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white border border-emerald-200 rounded-xl flex items-center justify-between shadow-2xs"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-slate-900">
                          ルール: {match.rule_name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          タイプ: {match.rule_type} (一致値: {match.match_value})
                        </p>
                      </div>
                    </div>
                    {match.site_title && (
                      <div className="text-right">
                        <span className="text-xs font-semibold text-slate-800 block">
                          サイト: {match.site_title}
                        </span>
                        <span className="text-[11px] font-bold text-blue-600 uppercase">
                          ロール: {match.role}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ルール作成・編集モーダル */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              {editingRule ? '振り分けルールを編集' : '新規振り分けルールを作成'}
            </h3>
            <p className="text-xs text-slate-500 mb-5">
              条件に合致するユーザーをサイトの指定ロールに自動招待・所属させます。
            </p>

            <form onSubmit={handleRuleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  ルール名 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="例: 社内GitHub Org自動編集者付与"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    対象プロバイダ
                  </label>
                  <select
                    value={provider}
                    onChange={(e: any) => setProvider(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                  >
                    <option value="all">すべて (All)</option>
                    <option value="github">GitHub</option>
                    <option value="discord">Discord</option>
                    <option value="google">Google</option>
                    <option value="email">Email</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    判定タイプ <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={ruleType}
                    onChange={(e: any) => setRuleType(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                  >
                    <option value="github_org">GitHub 組織名 (Org)</option>
                    <option value="discord_guild">Discord サーバー (名/ID)</option>
                    <option value="email_domain">メールドメイン (@corp.com)</option>
                    <option value="email_list">指定メール一覧 (カンマ区切り)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  判定する値 (Match Value) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    ruleType === 'github_org'
                      ? '例: my-company-org'
                      : ruleType === 'discord_guild'
                      ? '例: MyCommunityServer または サーバーID'
                      : ruleType === 'email_domain'
                      ? '例: @company.com'
                      : '例: user1@example.com, user2@example.com'
                  }
                  value={matchValue}
                  onChange={(e) => setMatchValue(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    所属させるサイト
                  </label>
                  <select
                    value={targetSiteId}
                    onChange={(e) => setTargetSiteId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                  >
                    <option value="">所属なし（認証のみ）</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title} ({s.slug})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    付与するロール
                  </label>
                  <select
                    value={targetRole}
                    onChange={(e: any) => setTargetRole(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                  >
                    <option value="viewer">Viewer (閲覧者)</option>
                    <option value="editor">Editor (編集者)</option>
                    <option value="admin">Admin (サイト管理者)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="auto_verify"
                  checked={autoVerify}
                  onChange={(e) => setAutoVerify(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <label htmlFor="auto_verify" className="text-slate-700 cursor-pointer">
                  マッチした場合、メールアドレスを自動的に認証済みにする
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-medium transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={saveRuleMutation.isPending}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {saveRuleMutation.isPending && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  {editingRule ? '更新する' : '作成する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

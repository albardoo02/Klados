import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
      <div className="text-center text-white px-4">
        <h1 className="text-6xl font-bold mb-4">
          Kla<span className="text-blue-400">dos</span>
        </h1>
        <p className="text-xl text-slate-300 mb-8">
          Markdownで美しいWebサイトを作ろう
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/register"
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg font-semibold transition-colors"
          >
            無料ではじめる
          </Link>
          <Link
            href="/login"
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition-colors"
          >
            ログイン
          </Link>
        </div>
      </div>
    </main>
  );
}

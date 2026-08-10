import { Link } from "react-router";

export default function SuperAdminDashboard({ stats }) {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Platform Overview</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back, Super Admin.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-indigo-50 text-indigo-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-widest">Total Organizations</p>
              <p className="text-3xl font-bold text-gray-900">{stats?.totalOrganizations || 0}</p>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100">
            <Link to="/organizations" className="text-sm text-indigo-600 font-medium hover:text-indigo-800 transition">
              Manage Organizations &rarr;
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-widest">Platform Users</p>
              <p className="text-3xl font-bold text-gray-900">{stats?.totalUsers || 0}</p>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100">
            <Link to="/users" className="text-sm text-emerald-600 font-medium hover:text-emerald-800 transition">
              View All Users &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
      <div className="max-w-xl w-full text-center space-y-6">
        
        <h1 className="text-4xl font-bold tracking-tight">
          SplitWork 💸
        </h1>

        <p className="text-slate-300 text-lg">
          Instant USDC split payments for creative teams
        </p>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <p className="text-sm text-slate-400">
            Create a smart split contract and pay collaborators instantly via Stellar.
          </p>

          <Link to="/create">
            <button className="w-full bg-emerald-500 hover:bg-emerald-400 transition text-black font-semibold py-3 rounded-xl">
              Create New Split
            </button>
          </Link>
        </div>

        <p className="text-xs text-slate-500">
          Powered by Soroban • USDC • Near-zero fees
        </p>

      </div>
    </div>
  );
}
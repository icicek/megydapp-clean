'use client';

import { useEffect, useState } from 'react';

export default function AdminPanel() {
  const [pool, setPool] = useState('');
  const [updating, setUpdating] = useState(false);
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const [toggleUpdating, setToggleUpdating] = useState(false);

  const adminWallet = process.env.NEXT_PUBLIC_ADMIN_WALLET;

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const poolRes = await fetch('/api/admin/config/distribution_pool');
        const poolJson = await poolRes.json();
        if (poolJson.success) setPool(poolJson.value);

        const claimRes = await fetch('/api/admin/config/claim_open');
        const claimJson = await claimRes.json();
        if (claimJson.success) setClaimOpen(claimJson.value === 'true');
      } catch (err) {
        console.error('Config fetch error:', err);
      } finally {
      }
    };

    fetchConfig();
  }, []);

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      const res = await fetch('/api/admin/config/distribution_pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: adminWallet, value: pool }),
      });
      const json = await res.json();
      alert(json.success ? '✅ Updated successfully!' : `❌ ${json.error}`);
    } catch (err) {
      console.error('Update error:', err);
    } finally {
      setUpdating(false);
    }
  };

  const handleSnapshot = async () => {
    setSnapshotMessage(null);
    try {
      const res = await fetch('/api/admin/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: adminWallet }),
      });
      const json = await res.json();
      setSnapshotMessage(json.success ? '✅ Snapshot complete' : `❌ ${json.error}`);
    } catch (err) {
      console.error('Snapshot error:', err);
      setSnapshotMessage('❌ Internal error');
    }
  };

  const toggleClaim = async () => {
    setToggleUpdating(true);
    try {
      const res = await fetch('/api/admin/config/claim_open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: adminWallet, value: (!claimOpen).toString() })
      });
      const json = await res.json();
      if (json.success) setClaimOpen(!claimOpen);
    } catch (err) {
      console.error('Toggle claim_open error:', err);
    } finally {
      setToggleUpdating(false);
    }
  };

  return (
    <div className="bg-black text-white min-h-screen p-10">
      <h1 className="text-3xl font-bold mb-6">🛠 Admin Panel</h1>

      <div className="bg-gray-900 border border-gray-700 p-6 rounded-xl max-w-xl">
        <label className="block mb-2 text-gray-400">Total Distribution Pool ($MEGY):</label>
        <input
          type="number"
          value={pool}
          onChange={(e) => setPool(e.target.value)}
          className="w-full p-2 rounded bg-gray-800 border border-gray-600 text-white"
        />
        <button
          onClick={handleUpdate}
          disabled={updating}
          className="mt-4 bg-blue-600 hover:bg-blue-700 py-2 px-4 rounded-lg font-bold"
        >
          {updating ? 'Updating...' : 'Update Pool'}
        </button>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-bold mb-2">📸 Snapshot</h2>
        <button
          onClick={handleSnapshot}
          className="bg-purple-600 hover:bg-purple-700 py-2 px-6 rounded-xl font-bold"
        >
          Take Snapshot
        </button>
        {snapshotMessage && (
          <p className="mt-4 text-sm text-yellow-400">{snapshotMessage}</p>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-bold mb-2">🚪 Claim Access</h2>
        <button
          onClick={toggleClaim}
          disabled={toggleUpdating}
          className="bg-red-600 hover:bg-red-700 py-2 px-6 rounded-xl font-bold"
        >
          {toggleUpdating ? 'Updating...' : claimOpen ? '🔒 Disable Claiming' : '🔓 Enable Claiming'}
        </button>
        <p className="mt-2 text-sm text-gray-400">
          Claiming is currently <strong>{claimOpen ? 'ENABLED ✅' : 'DISABLED ❌'}</strong>
        </p>
      </div>
    </div>
  );
}

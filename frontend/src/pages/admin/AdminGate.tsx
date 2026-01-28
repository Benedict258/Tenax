const AdminGate = () => (
  <div className="rounded-3xl border border-white/10 bg-white/5/5 p-6 text-center">
    <p className="text-lg font-semibold">Admin view disabled</p>
    <p className="text-white/60 text-sm mt-2">Set VITE_ENABLE_ADMIN_DASH=true to unlock these panels.</p>
  </div>
);

export default AdminGate;

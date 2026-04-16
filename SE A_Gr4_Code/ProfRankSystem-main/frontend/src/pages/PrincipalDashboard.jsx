import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import DepartmentManager from "../components/DepartmentManager";
import RankingView from "../components/RankingView";
import QRGenerator from "../components/QRGenerator";
import ChangePasswordModal from "../components/ChangePasswordModal";

export default function PrincipalDashboard() {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState("departments");
  const [passwordModal, setPasswordModal] = useState(false);

  const renderContent = () => {
    switch (activeTab) {
      case "departments":
        return <DepartmentManager />;
      case "rankings":
        return <RankingView />;
      case "qr":
        return <QRGenerator />;
      default:
        return <DepartmentManager />;
    }
  };

  const TabButton = ({ id, label }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-6 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${
        activeTab === id
          ? "border-black text-black"
          : "border-transparent text-gray-400 hover:text-gray-600"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="bg-black text-white p-4 flex justify-between items-center sticky top-0 z-10 shadow-none">
        <h1 className="text-xl font-bold uppercase tracking-wide">
          Principal Dashboard
        </h1>
        <div className="flex gap-3">
          <button
            onClick={() => setPasswordModal(true)}
            className="border border-white px-4 py-1 text-sm font-medium hover:bg-white hover:text-black transition-colors uppercase"
          >
            Change Password
          </button>

          <button
            onClick={logout}
            className="border border-white px-4 py-1 text-sm font-medium hover:bg-white hover:text-black transition-colors uppercase"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="border-b border-gray-200 bg-gray-50 px-8">
        <div className="flex gap-4">
          <TabButton id="departments" label="Departments" />
          <TabButton id="rankings" label="View Rankings" />
          <TabButton id="qr" label="QR Generator" />
        </div>
      </div>

      <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
        {renderContent()}
      </main>

      <ChangePasswordModal
        isOpen={passwordModal}
        onClose={() => setPasswordModal(false)}
      />
    </div>
  );
}

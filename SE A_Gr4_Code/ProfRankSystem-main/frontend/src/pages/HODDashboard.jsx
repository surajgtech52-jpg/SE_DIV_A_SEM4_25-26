import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import DivisionManager from "../components/DivisionManager";
import TeacherManager from "../components/TeacherManager";
import SubjectManager from "../components/SubjectManager";
import ChangePasswordModal from "../components/ChangePasswordModal";

export default function HODDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("divisions");
  const [passwordModal, setPasswordModal] = useState(false);

  const renderContent = () => {
    switch (activeTab) {
      case "divisions":
        return <DivisionManager />;
      case "teachers":
        return <TeacherManager />;
      case "subjects":
        return <SubjectManager />;
      default:
        return <DivisionManager />;
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
      <header className="bg-black text-white p-4 flex justify-between items-center sticky top-0 z-10">
        <h1 className="text-xl font-bold uppercase tracking-wide">
          HOD Dashboard - {user?.dept || "Department"}
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
          <TabButton id="divisions" label="Classrooms" />
          <TabButton id="teachers" label="Professors" />
          <TabButton id="subjects" label="Subjects" />
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

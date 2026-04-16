import { useState, useEffect } from "react";
import { Table, Button, Modal, Input } from "./ui/SharedComponents";

export default function DepartmentManager() {
  const [departments, setDepartments] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: "", username: "" });

  useEffect(() => {
    const initData = async () => {
      try {
        const response = await fetch("/api/departments");
        const dbData = await response.json();

        const mappedData = dbData.map((dept) => ({
          id: dept.id,
          name: dept.code,
          username: dept.username,
        }));
        setDepartments(mappedData);
      } catch (error) {
        setDepartments([
          { id: 1, name: "Computer Engineering" },
          { id: 2, name: "AIML" },
          { id: 3, name: "IT" },
        ]);
      }
    };
    initData();
  }, []);

  const copyCredentials = (username, password) => {
    const text = `Username: ${username}\nPassword: ${password}`;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      alert(`Credentials copied!\n\n${text}`);
    } catch (err) {
      console.error("Clipboard failed:", err);
      alert(text);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      id: editingId,
      name: formData.name,
      username: formData.username,
    };

    try {
      const response = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();

        if (data.tempPassword) {
          copyCredentials(data.username, data.tempPassword);
        }

        const res = await fetch("/api/departments");
        const dbData = await res.json();

        setDepartments(
          dbData.map((d) => ({
            id: d.id,
            name: d.code,
            username: d.username,
          })),
        );

        closeModal();
      } else {
        const err = await response.json();
        alert(err.message || "Operation failed");
      }
    } catch (error) {
      console.error("Connection to backend failed");
    }
  };

  const openModal = (dept = null) => {
    if (dept) {
      setEditingId(dept.id);
      setFormData({ name: dept.name, username: dept.username });
    } else {
      setEditingId(null);
      setFormData({ name: "", username: "" });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData({ name: "", username: "" });
  };

  const handleResetPassword = async (id, username) => {
    if (!window.confirm(`Reset password for ${username}?`)) return;

    try {
      const response = await fetch(`/api/departments/${id}/reset-password`, {
        method: "POST",
      });

      const data = await response.json();

      if (response.ok) {
        copyCredentials(username, data.tempPassword);
      } else {
        alert(data.message || "Password reset failed");
      }
    } catch (error) {
      console.error("Reset failed:", error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this department?")) {
      try {
        const response = await fetch(`/api/departments/${id}`, {
          method: "DELETE",
        });

        if (response.ok) {
          setDepartments(departments.filter((d) => d.id !== id));
        } else {
          alert("Failed to delete from database");
        }
      } catch (error) {
        console.error("Delete request failed:", error);
      }
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-bold uppercase tracking-wide">
          Manage Departments
        </h2>
        <Button onClick={() => openModal()}>+ Add Department</Button>
      </div>

      <Table
        headers={["ID", "Department Name", "Username", "Actions"]}
        data={departments}
        renderRow={(dept) => (
          <tr key={dept.id} className="hover:bg-gray-50 transition-colors">
            <td className="p-3 border-r border-gray-200">{dept.id}</td>
            <td className="p-3 border-r border-gray-200 font-medium">
              {dept.name}
            </td>
            <td className="p-3 border-r border-gray-200">{dept.username}</td>
            <td className="p-3 flex gap-2">
              <Button
                variant="secondary"
                onClick={() => openModal(dept)}
                className="text-xs px-2 py-1"
              >
                Edit
              </Button>

              <Button
                variant="secondary"
                onClick={() => handleResetPassword(dept.id, dept.username)}
                className="text-xs px-2 py-1"
              >
                Reset Password
              </Button>

              <Button
                variant="danger"
                onClick={() => handleDelete(dept.id)}
                className="text-xs px-2 py-1"
              >
                Delete
              </Button>
            </td>
          </tr>
        )}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingId ? "Edit Department" : "Add Department"}
      >
        <form onSubmit={handleSubmit}>
          <Input
            label="Department Name"
            value={formData.name}
            onChange={(e) => {
              const deptName = e.target.value
                .toLowerCase()
                .replace(/\s+/g, "_");
              setFormData({
                ...formData,
                name: e.target.value,
                username: deptName ? `${deptName}_hod` : "",
              });
            }}
            required
            placeholder="e.g. Computer Engineering"
          />
          <Input
            label="HOD Username"
            value={formData.username}
            onChange={(e) =>
              setFormData({ ...formData, username: e.target.value })
            }
            required
            placeholder="e.g. aimlhod"
          />
          <div className="flex justify-end gap-3 mt-6">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit">{editingId ? "Save" : "Add"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

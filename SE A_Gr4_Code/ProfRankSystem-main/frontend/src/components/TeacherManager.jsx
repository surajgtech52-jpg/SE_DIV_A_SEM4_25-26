import { useState, useEffect } from "react";
import { Table, Button, Modal, Input } from "./ui/SharedComponents";

export default function TeacherManager() {
  const [teachers, setProffs] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: "" });

  useEffect(() => {
    fetchProffs();
  }, []);

  const fetchProffs = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/proffs", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json();
    setProffs(data);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    if (editingId) {
      await fetch(`/api/proffs/${editingId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
    } else {
      await fetch("/api/proffs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
    }

    await fetchProffs();
    closeModal();
  };

  const openModal = (teacher = null) => {
    if (teacher) {
      setEditingId(teacher.id);
      setFormData({ name: teacher.name });
    } else {
      setEditingId(null);
      setFormData({ name: "" });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData({ name: "" });
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Remove ${name}?`)) return;

    const token = localStorage.getItem("token");

    const res = await fetch(`/api/proffs/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();

    if (!res.ok) {
      if (data.classrooms) {
        alert(
          `Cannot delete ${name}\n\nAssigned to:\n` +
            data.classrooms.join("\n"),
        );
      } else {
        alert(data.message || "Delete failed");
      }
      return;
    }

    await fetchProffs();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-bold uppercase tracking-wide">
          Manage Teachers
        </h2>
        <Button onClick={() => openModal()}>+ Add Teacher</Button>
      </div>

      <Table
        headers={["ID", "Name", "Actions"]}
        data={teachers}
        renderRow={(t) => (
          <tr key={t.id} className="hover:bg-gray-50">
            <td className="p-3 border-r border-gray-200">{t.id}</td>
            <td className="p-3 border-r border-gray-200 font-medium">
              {t.name}
            </td>
            <td className="p-3 flex gap-2">
              <Button
                variant="secondary"
                onClick={() => openModal(t)}
                className="text-xs px-2 py-1"
              >
                Edit
              </Button>
              <Button
                variant="danger"
                onClick={() => handleDelete(t.id, t.name)}
                className="text-xs px-2 py-1"
              >
                Remove
              </Button>
            </td>
          </tr>
        )}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingId ? "Edit Teacher" : "Add Teacher"}
      >
        <form onSubmit={handleSubmit}>
          <Input
            label="Full Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            placeholder="e.g. Teacher 1"
          />
          <div className="flex justify-end gap-3 mt-6">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

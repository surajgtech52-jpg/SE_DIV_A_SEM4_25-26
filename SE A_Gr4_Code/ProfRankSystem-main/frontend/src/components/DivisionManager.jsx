import { useState, useEffect } from "react";
import { Table, Button, Modal, Input } from "./ui/SharedComponents";
import SearchSelect from "./SearchSelect";

export default function DivisionManager() {
  const [classrooms, setClassrooms] = useState([]);
  const [isClassroomModalOpen, setIsClassroomModalOpen] = useState(false);
  const [editingClassroomId, setEditingClassroomId] = useState(null);
  const [classroomForm, setClassroomForm] = useState({ year: "", name: "" });

  // Assignment State
  const [assignments, setAssignments] = useState([]);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState({
    sub_id: "",
    proff_id: "",
  });
  const [editingAssignmentId, setEditingAssignmentId] = useState(null);

  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [editingSubjectName, setEditingSubjectName] = useState("");

  useEffect(() => {
    fetchTeachers();
    fetchSubjects();
    fetchClassrooms();
  }, []);

  const fetchTeachers = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/proffs", {
      headers: { Authorization: `Bearer ${token}` },
    });
    setTeachers(await res.json());
  };

  const fetchSubjects = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/subjects", {
      headers: { Authorization: `Bearer ${token}` },
    });
    setSubjects(await res.json());
  };

  const fetchClassrooms = async () => {
    const token = localStorage.getItem("token");

    const res = await fetch("/api/classes", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();
    setClassrooms(
      data.map((c) => ({
        id: c.id,
        year: c.year,
        name: c.division,
      })),
    );
  };

  const handleClassroomSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    const payload = {
      year: classroomForm.year,
      division: classroomForm.name,
    };

    if (editingClassroomId) {
      await fetch(`/api/classes/${editingClassroomId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/classes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    }

    await fetchClassrooms();
    closeClassroomModal();
  };

  const openClassroomModal = (cls = null) => {
    if (cls) {
      setEditingClassroomId(cls.id);
      setClassroomForm({ year: cls.year, name: cls.name });
    } else {
      setEditingClassroomId(null);
      setClassroomForm({ year: "", name: "" });
    }
    setIsClassroomModalOpen(true);
  };

  const closeClassroomModal = () => {
    setIsClassroomModalOpen(false);
    setClassroomForm({ year: "", name: "" });
  };

  const handleClassroomDelete = async (id) => {
    if (!confirm("Delete this classroom?")) return;

    const token = localStorage.getItem("token");

    await fetch(`/api/classes/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    fetchClassrooms();
  };

  const openAssignmentModal = async (cls) => {
    setSelectedClassroom(cls);
    setIsAssignmentModalOpen(true);
    setEditingAssignmentId(null);

    const token = localStorage.getItem("token");

    const res = await fetch(
      `/api/classes/${cls.id}/linkings`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const data = await res.json();
    setAssignments(data);
  };

  const closeAssignmentModal = () => {
    setIsAssignmentModalOpen(false);
    setSelectedClassroom(null);
    setAssignmentForm({ sub_id: "", proff_id: "" });
  };

  const handleAssignmentSubmit = async (e) => {
    e.preventDefault();
    if (!assignmentForm.sub_id || !assignmentForm.proff_id) {
      alert("Please select both subject and professor");
      return;
    }
    const token = localStorage.getItem("token");

    if (editingAssignmentId) {
      await fetch(`/api/linkings/${editingAssignmentId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ proff_id: assignmentForm.proff_id }),
      });
    } else {
      await fetch(
        `/api/classes/${selectedClassroom.id}/linkings`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(assignmentForm),
        },
      );
    }

    openAssignmentModal(selectedClassroom);
    setEditingAssignmentId(null);
    setAssignmentForm({ sub_id: "", proff_id: "" });
    setEditingSubjectName("");
  };

  const handleEditAssignment = (assignment) => {
    setAssignmentForm({
      sub_id: assignment.sub_id,
      proff_id: assignment.proff_id,
    });
    setEditingSubjectName(assignment.subject);
    setEditingAssignmentId(assignment.id);
  };

  const handleDeleteAssignment = async (id) => {
    const token = localStorage.getItem("token");

    await fetch(`/api/linkings/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    openAssignmentModal(selectedClassroom); // reload
  };

  const currentAssignments = assignments;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-bold uppercase tracking-wide">
          Manage Classrooms
        </h2>
        <Button onClick={() => openClassroomModal()}>+ Add Classroom</Button>
      </div>

      <Table
        headers={["ID", "Year", "Division", "Subjects", "Actions"]}
        data={classrooms}
        renderRow={(cls) => {
          return (
            <tr key={cls.id} className="hover:bg-gray-50">
              <td className="p-3 border-r border-gray-200 w-16 text-center">
                {cls.id}
              </td>
              <td className="p-3 border-r border-gray-200 font-medium">
                {cls.year}
              </td>
              <td className="p-3 border-r border-gray-200 font-medium">
                {cls.name}
              </td>
              <td className="p-3 border-r border-gray-200 text-sm text-gray-600">
                <button
                  onClick={() => openAssignmentModal(cls)}
                  className="text-blue-600 hover:text-blue-800 font-bold uppercase text-xs"
                >
                  Manage
                </button>
              </td>
              <td className="p-3 flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => openClassroomModal(cls)}
                  className="text-xs px-2 py-1"
                >
                  Rename
                </Button>
                <Button
                  variant="danger"
                  onClick={() => handleClassroomDelete(cls.id)}
                  className="text-xs px-2 py-1"
                >
                  Delete
                </Button>
              </td>
            </tr>
          );
        }}
      />

      <Modal
        isOpen={isClassroomModalOpen}
        onClose={closeClassroomModal}
        title={editingClassroomId ? "Edit Classroom" : "Add Classroom"}
      >
        <form onSubmit={handleClassroomSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold uppercase mb-1">
                Year
              </label>
              <select
                className="w-full p-2 border border-black rounded-none focus:outline-none focus:ring-1 focus:ring-black"
                value={classroomForm.year}
                onChange={(e) =>
                  setClassroomForm({ ...classroomForm, year: e.target.value })
                }
                required
              >
                <option value="">Select Year...</option>
                <option value="FE">FE</option>
                <option value="SE">SE</option>
                <option value="TE">TE</option>
                <option value="BE">BE</option>
              </select>
            </div>
            <Input
              label="Classroom / Division"
              value={classroomForm.name}
              onChange={(e) =>
                setClassroomForm({ ...classroomForm, name: e.target.value })
              }
              required
              placeholder="e.g. A"
            />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button
              type="button"
              variant="secondary"
              onClick={closeClassroomModal}
            >
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>

      {isAssignmentModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 w-full max-w-3xl shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h3 className="text-xl font-bold uppercase">
                Subjects for {selectedClassroom?.year} {selectedClassroom?.name}
              </h3>
              <button
                onClick={closeAssignmentModal}
                className="text-gray-500 hover:text-black font-bold text-xl"
              >
                &times;
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 border-r pr-6">
                <h4 className="font-bold text-sm uppercase mb-4 text-gray-500">
                  Subject List
                </h4>
                {currentAssignments.length === 0 ? (
                  <p className="text-gray-400 italic">No subjects added yet.</p>
                ) : (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {currentAssignments.map((a) => (
                      <div
                        key={a.id}
                        className="flex justify-between items-center bg-gray-50 p-3 border border-gray-100 hover:border-gray-300 transition-colors"
                      >
                        <div>
                          <div className="font-bold text-sm">{a.subject}</div>
                          <div className="text-xs text-gray-600">
                            {a.teacher}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditAssignment(a)}
                            className="text-xs font-bold text-blue-600 hover:text-blue-800 uppercase"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteAssignment(a.id)}
                            className="text-xs font-bold text-red-600 hover:text-red-800 uppercase"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-bold text-sm uppercase mb-4 text-gray-500">
                  {editingAssignmentId ? "Edit Subject" : "Add Subject"}
                </h4>
                <form onSubmit={handleAssignmentSubmit} className="space-y-4">
                  {!editingAssignmentId && (
                    <SearchSelect
                      label="Subject"
                      items={subjects}
                      onSelect={(s) =>
                        setAssignmentForm((f) => ({ ...f, sub_id: s.id }))
                      }
                    />
                  )}

                  {editingAssignmentId && (
                    <div className="border p-2 text-sm bg-gray-50">
                      <span className="font-bold">Subject:</span>{" "}
                      {editingSubjectName}
                    </div>
                  )}

                  <SearchSelect
                    label="Professor"
                    items={teachers}
                    onSelect={(t) =>
                      setAssignmentForm((f) => ({ ...f, proff_id: t.id }))
                    }
                  />

                  <div className="flex flex-col gap-2 pt-2">
                    <Button
                      type="submit"
                      variant="primary"
                      className="w-full"
                      disabled={
                        !assignmentForm.proff_id ||
                        (!editingAssignmentId && !assignmentForm.sub_id)
                      }
                    >
                      {editingAssignmentId ? "Update" : "Add"}
                    </Button>

                    {editingAssignmentId && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setEditingAssignmentId(null);
                          setAssignmentForm({ sub_id: "", proff_id: "" });
                          setEditingSubjectName("");
                        }}
                        className="w-full"
                      >
                        Cancel Edit
                      </Button>
                    )}
                  </div>
                </form>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t flex justify-end">
              <Button onClick={closeAssignmentModal} variant="secondary">
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

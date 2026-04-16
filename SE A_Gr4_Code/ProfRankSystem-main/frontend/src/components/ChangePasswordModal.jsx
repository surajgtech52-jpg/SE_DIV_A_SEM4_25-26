import { useState } from "react";
import { Modal, Button, Input } from "./ui/SharedComponents";

export default function ChangePasswordModal({ isOpen, onClose }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();

    setSaving(true);

    try {
      const token = localStorage.getItem("token");

      const res = await fetch("/api/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          newPassword: password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "Password change failed");
        setSaving(false);
        return;
      }

      alert("Password updated successfully");

      setPassword("");
      onClose();
    } catch (err) {
      console.error(err);
      alert("Server error");
    }

    setSaving(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Change Password"
    >
      <form onSubmit={handleSave}>
        <Input
          label="New Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="Enter new password"
        />

        <div className="flex justify-end gap-3 mt-6">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>

          <Button type="submit">
            {saving ? "Saving..." : "Save Password"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
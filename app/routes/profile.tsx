import React, { useState } from "react";
import { User, Camera, Lock, LogOut } from "lucide-react";

interface ProfileData {
    displayName: string;
    email: string;
    photoURL: string;
    phone?: string;
    bio?: string;
}

export default function ProfilePage() {
    const [isEditing, setIsEditing] = useState(false);
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const [profileData, setProfileData] = useState<ProfileData>({
        displayName: "John Doe",
        email: "john@example.com",
        photoURL: "",
        phone: "+1-555-0123",
        bio: "Healthcare professional",
    });

    const [formData, setFormData] = useState<ProfileData>(profileData);

    const [passwordData, setPasswordData] = useState({
        newPassword: "",
        confirmPassword: "",
    });

    const handleInputChange = (
        e: React.ChangeEvent<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >
    ) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setPasswordData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handlePhotoUpload = async (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        if (!e.target.files?.[0]) return;

        setUploading(true);
        setError("");

        try {
            // Simulate file upload - in prod, prefer Firebase Storage
            const file = e.target.files[0];
            const reader = new FileReader();

            reader.onload = () => {
                setFormData((prev) => ({
                    ...prev,
                    photoURL: reader.result as string,
                }));
                setSuccess("Profile photo updated successfully!");
                setTimeout(() => setSuccess(""), 3000);
            };

            reader.readAsDataURL(file);
        } catch {
            setError("Failed to upload photo");
        } finally {
            setUploading(false);
        }
    };

    const handleSaveProfile = () => {
        setError("");
        setSuccess("");

        try {
            setProfileData(formData);
            setIsEditing(false);
            setSuccess("Profile updated successfully!");
            setTimeout(() => setSuccess(""), 3000);
        } catch {
            setError("Failed to update profile");
        }
    };

    const handleChangePassword = () => {
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setError("Passwords do not match");
            return;
        }
        if (passwordData.newPassword.length < 6) {
            setError("Password must be at least 6 characters");
            return;
        }

        setError("");
        setSuccess("");

        try {
            setPasswordData({ newPassword: "", confirmPassword: "" });
            setIsChangingPassword(false);
            setSuccess("Password changed successfully!");
            setTimeout(() => setSuccess(""), 3000);
        } catch {
            setError("Failed to change password");
        }
    };

    const handleLogout = () => {
        window.location.href = "/login";
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-r from-gray-200 to-gray-500 py-8">
            <div className="bg-white w-full max-w-2xl p-8 rounded-lg shadow-lg">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold text-gray-800">
                        My Profile
                    </h1>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                    >
                        <LogOut size={18} />
                        Logout
                    </button>
                </div>

                {/* Messages */}
                {error && (
                    <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                        {error}
                    </div>
                )}
                {success && (
                    <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
                        {success}
                    </div>
                )}

                {/* Profile Picture Section */}
                <div className="flex flex-col items-center mb-8 pb-6 border-b">
                    <div className="relative">
                        {formData.photoURL ? (
                            <img
                                src={formData.photoURL}
                                alt="Profile"
                                className="w-32 h-32 rounded-full object-cover border-4 border-gray-300"
                            />
                        ) : (
                            <div className="w-32 h-32 rounded-full bg-gray-300 flex items-center justify-center border-4 border-gray-300">
                                <User size={64} className="text-gray-600" />
                            </div>
                        )}
                        <label className="absolute bottom-0 right-0 bg-black text-white p-2 rounded-full cursor-pointer hover:bg-gray-800 transition">
                            <Camera size={20} />
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handlePhotoUpload}
                                disabled={uploading}
                                className="hidden"
                            />
                        </label>
                    </div>
                    {uploading && (
                        <p className="text-sm text-gray-600 mt-2">
                            Uploading...
                        </p>
                    )}
                </div>

                {/* Edit Prof */}
                {!isEditing ? (
                    <div className="space-y-6 mb-8">
                        {/* Display Info */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-gray-700">
                                    Full Name
                                </label>
                                <p className="text-gray-900 mt-1">
                                    {profileData.displayName || "Not set"}
                                </p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700">
                                    Phone
                                </label>
                                <p className="text-gray-900 mt-1">
                                    {profileData.phone || "Not set"}
                                </p>
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-gray-700">
                                Email
                            </label>
                            <p className="text-gray-900 mt-1">
                                {profileData.email}
                            </p>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-gray-700">
                                Bio
                            </label>
                            <p className="text-gray-900 mt-1">
                                {profileData.bio || "No bio added"}
                            </p>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                onClick={() => setIsEditing(true)}
                                className="flex-1 bg-black text-white py-2 rounded-lg hover:bg-gray-800 transition"
                            >
                                Edit Profile
                            </button>
                            <button
                                onClick={() => setIsChangingPassword(true)}
                                className="flex-1 bg-gray-600 text-white py-2 rounded-lg hover:bg-gray-700 transition flex items-center justify-center gap-2"
                            >
                                <Lock size={18} />
                                Change Password
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Edit Form */
                    <div className="space-y-4 mb-8">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Full Name
                            </label>
                            <input
                                type="text"
                                name="displayName"
                                value={formData.displayName}
                                onChange={handleInputChange}
                                className="w-full border rounded-lg px-3 py-2 bg-white text-gray-900 outline-none focus:border-black"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Email
                            </label>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleInputChange}
                                className="w-full border rounded-lg px-3 py-2 bg-white text-gray-900 outline-none focus:border-black"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Phone
                            </label>
                            <input
                                type="tel"
                                name="phone"
                                value={formData.phone}
                                onChange={handleInputChange}
                                className="w-full border rounded-lg px-3 py-2 bg-white text-gray-900 outline-none focus:border-black"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Bio
                            </label>
                            <textarea
                                name="bio"
                                value={formData.bio}
                                onChange={handleInputChange}
                                rows={4}
                                className="w-full border rounded-lg px-3 py-2 bg-white text-gray-900 outline-none focus:border-black"
                            />
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                onClick={handleSaveProfile}
                                className="flex-1 bg-black text-white py-2 rounded-lg hover:bg-gray-800 transition"
                            >
                                Save Changes
                            </button>
                            <button
                                onClick={() => {
                                    setIsEditing(false);
                                    setFormData(profileData);
                                }}
                                className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Change Password Section */}
                {isChangingPassword && (
                    <>
                        <div className="border-t pt-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">
                                Change Password
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        New Password
                                    </label>
                                    <div className="flex items-center border rounded-lg px-3 py-2">
                                        <Lock
                                            size={18}
                                            className="text-gray-400 mr-2"
                                        />
                                        <input
                                            type="password"
                                            name="newPassword"
                                            value={passwordData.newPassword}
                                            onChange={handlePasswordChange}
                                            placeholder="Enter new password"
                                            className="w-full outline-none text-gray-700"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Confirm Password
                                    </label>
                                    <div className="flex items-center border rounded-lg px-3 py-2">
                                        <Lock
                                            size={18}
                                            className="text-gray-400 mr-2"
                                        />
                                        <input
                                            type="password"
                                            name="confirmPassword"
                                            value={passwordData.confirmPassword}
                                            onChange={handlePasswordChange}
                                            placeholder="Confirm new password"
                                            className="w-full outline-none text-gray-700"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <button
                                        onClick={handleChangePassword}
                                        className="flex-1 bg-black text-white py-2 rounded-lg hover:bg-gray-800 transition"
                                    >
                                        Update Password
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsChangingPassword(false);
                                            setPasswordData({
                                                newPassword: "",
                                                confirmPassword: "",
                                            });
                                        }}
                                        className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

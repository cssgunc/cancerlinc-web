import React from "react";

export default function Profile() {
    // Mock data
    const referrals = [
        {
            name: "Dr. Emily Carter, MD",
            phone: "(111) 234-5678",
            email: "emily.carter@duke.edu",
            hospital: "Duke Neurology Clinic",
            referredBy: "Jake Morrison",
            role: "Doctor",
        },
        {
            name: "Nurse Sarah Lee, RN, MPH",
            phone: "(111) 234-5678",
            email: "sarah.lee@unchealth.com",
            hospital: "UNC Hospitals – Hillsborough Campus",
            referredBy: "Emily Chen",
            role: "Nurse",
        },
        {
            name: "Dr. Alex Smith, MD",
            phone: "(111) 234-5678",
            email: "alex.smith@unchealth.com",
            hospital: "UNC Hospital Cardiology",
            referredBy: "Jake Morrison",
            role: "Radiologist",
        },
    ];

    const messages = [
        {
            sender: "social",
            text: "Hello! Of course, I'm here to help. What would you like to know?",
            time: "10:25 AM",
        },
        {
            sender: "patient",
            text: "Should I bring anything specific to my appointment next week?",
            time: "10:26 AM",
        },
        {
            sender: "social",
            text: "Great question! Let me check your checklist. You'll want to bring your insurance card, photo ID, and current medication list.",
            time: "10:28 AM",
        },
        {
            sender: "patient",
            text: "Thank you! That’s very helpful.",
            time: "10:29 AM",
        },
        {
            sender: "social",
            text: "You’re welcome! Feel free to reach out if you have any other questions.",
            time: "10:30 AM",
        },
    ];

    return (
        <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
            {/* Navbar */}
            <header className="flex justify-between items-center px-10 py-4 bg-white border-b">
                <div className="flex items-center gap-4">
                    <img src="" alt="CancerLINC" className="w-10 h-10" />
                    <input
                        type="text"
                        placeholder="Search patients or social workers..."
                        className="border rounded-md px-3 py-1 text-sm w-96 focus:outline-blue-500"
                    />
                </div>
                <div className="text-sm text-gray-600">
                    Welcome, David{" "}
                    <button className="ml-2 text-blue-600 hover:underline">
                        Logout
                    </button>
                </div>
            </header>

            {/* Main Section */}
            <main className="flex justify-center mt-6 flex-1 px-6">
                <div className="w-full max-w-6xl">
                    <h1 className="text-2xl font-semibold text-center mb-6 text-black">
                        David Thompson
                    </h1>

                    <div className="grid grid-cols-2 gap-6">
                        {/* Left: Referrals */}
                        <section className="bg-white rounded-xl shadow-sm p-5 overflow-y-auto">
                            <h2 className="text-lg font-semibold mb-4">
                                David Thompson’s Referrals
                            </h2>
                            <div className="space-y-4">
                                {referrals.map((r, idx) => (
                                    <div
                                        key={idx}
                                        className="relative group rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-4 hover:shadow-md transition"
                                    >
                                        <div className="absolute top-2 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                                            <button className="text-gray-500 hover:text-blue-600 text-xs">
                                                Edit
                                            </button>
                                            <button className="text-gray-500 hover:text-red-500 text-xs">
                                                Remove
                                            </button>
                                        </div>
                                        <p className="font-semibold text-sm">
                                            {r.name}
                                        </p>
                                        <p className="text-sm text-gray-700">
                                            {r.phone}
                                        </p>
                                        <p className="text-sm text-gray-700">
                                            {r.email}
                                        </p>
                                        <p className="text-sm text-gray-700">
                                            {r.hospital}
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            Referred By: {r.referredBy}
                                        </p>
                                        <button className="mt-2 px-3 py-1 bg-blue-600 text-white rounded-md text-sm">
                                            {r.role} Website
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Right: Chat */}
                        <section className="bg-white rounded-xl shadow-sm p-5 flex flex-col justify-between">
                            <h2 className="text-lg font-semibold mb-4 text-center">
                                Chat with David
                            </h2>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto space-y-3 mb-6 px-2">
                                {messages.map((m, idx) => (
                                    <div
                                        key={idx}
                                        className={`flex ${
                                            m.sender === "social"
                                                ? "justify-end"
                                                : "justify-start"
                                        }`}
                                    >
                                        <div
                                            className={`max-w-[70%] px-4 py-2 rounded-lg leading-snug ${
                                                m.sender === "social"
                                                    ? "bg-black text-white"
                                                    : "bg-gray-100 text-gray-800"
                                            }`}
                                        >
                                            <p className="text-sm">{m.text}</p>
                                            <p className="text-[10px] mt-1 opacity-70 text-right">
                                                {m.time}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Input */}
                            <div className="flex items-center gap-3 border-t pt-3 bg-gray-50 rounded-lg px-3 py-2">
                                <input
                                    type="text"
                                    placeholder="Type or add image..."
                                    className="flex-1 bg-transparent text-sm px-2 py-1 focus:outline-none"
                                />
                                <button className="text-gray-600 hover:text-blue-600 text-sm">
                                    Attach
                                </button>
                                <button className="text-gray-600 hover:text-blue-600 text-sm">
                                    Send
                                </button>
                            </div>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
}

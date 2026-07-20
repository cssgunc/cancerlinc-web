import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { loginWithEmail } from "../services/auth_service";

export default function Login() {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [remember, setRemember] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function onClickLogin(e: React.FormEvent) {
        e.preventDefault();
        if (isSubmitting) return;

        setError(null);
        setIsSubmitting(true);
        try {
            await loginWithEmail({
                email,
                password,
                remember,
            });
            navigate("/");
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : "Failed to login";
            setError(message);
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-r from-gray-200 to-gray-500">
            <div className="bg-white w-full max-w-md p-8">
                <div className="flex flex-col items-center mb-6">
                    <img
                        src="/CancerLINC-Logo-1.png"
                        alt="CancerLINC Logo"
                        className="w-40 mb-4"
                    />
                    <h2 className="text-2xl text-gray-800">Login</h2>
                    <p className="text-gray-500 text-center text-sm mt-2">
                        Enter your email address and password to access your
                        account.
                    </p>
                </div>

                <form className="space-y-4" onSubmit={onClickLogin}>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Email Address
                        </label>
                        <div className="flex items-center border rounded-lg px-3 py-2">
                            <span className="text-gray-400 mr-2 text-lg">
                                ✉
                            </span>
                            <input
                                type="email"
                                placeholder="Enter your email"
                                className="w-full outline-none text-gray-700"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={isSubmitting}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Password
                        </label>
                        <div className="flex items-center border rounded-lg px-3 py-2">
                            <span className="text-gray-400 mr-2 text-lg">
                                🔒
                            </span>
                            <input
                                type="password"
                                placeholder="Enter your password"
                                className="w-full outline-none text-gray-700"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={isSubmitting}
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                        <label className="flex items-center space-x-2 text-gray-700">
                            <input
                                type="checkbox"
                                className="rounded"
                                checked={remember}
                                onChange={(e) => setRemember(e.target.checked)}
                                disabled={isSubmitting}
                            />
                            <span>Remember Me</span>
                        </label>
                        <Link
                            to="/forgot-pass"
                            className="text-blue-600 hover:underline"
                        >
                            Forgot Password?
                        </Link>
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        aria-busy={isSubmitting}
                        className="w-full bg-black text-white py-2 rounded-lg hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? "LOGGING IN..." : "LOGIN"}
                    </button>

                    {error ? (
                        <p className="text-sm text-red-600">{error}</p>
                    ) : null}
                </form>
            </div>
        </div>
    );
}

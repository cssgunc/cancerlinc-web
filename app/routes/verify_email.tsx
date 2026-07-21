import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "~/services/firebase_provider";
import { sendEmailVerification } from "firebase/auth";

export default function VerifyEmail() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [checkingVerification, setCheckingVerification] = useState(false);
    const [resendingEmail, setResendingEmail] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resendSuccess, setResendSuccess] = useState(false);

    const onClickContinue = async () => {
        if (!user) {
            setError("You're not signed in. Please log in again!");
            return;
        }

        setError(null);
        setCheckingVerification(true);
        try {
            await user.reload();

            if (!user.emailVerified) {
                setError(
                    "Email not verified yet. Please click the link in your email inbox first."
                );
                return;
            }

            navigate("/");
        } catch {
            setError(
                "Something went wrong. Please check your connection and try again."
            );
        } finally {
            setCheckingVerification(false);
        }
    };

    const onClickResendEmail = async () => {
        if (!user) {
            setError("You're not signed in. Please log in again.");
            return;
        }

        setError(null);
        setResendSuccess(false);
        setResendingEmail(true);
        try {
            await sendEmailVerification(user);
            setResendSuccess(true);
        } catch (err: unknown) {
            if (
                err instanceof Error &&
                (err as { code?: string }).code === "auth/too-many-requests"
            ) {
                setError(
                    "Too many attempts. Please wait a moment before requesting a new link."
                );
            } else {
                setError(
                    "Failed to send verification email. Please try again."
                );
            }
        } finally {
            setResendingEmail(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-r from-gray-200 to-gray-500">
            <div className="bg-white w-full max-w-md p-8">
                <Link to="/login">
                    <p className="text-gray-500 text-sm mt-2">
                        {"<"} Back to login
                    </p>
                </Link>

                <div className="flex flex-col items-center mb-6 mt-8">
                    <h2 className="text-2xl text-gray-800">Verify Email</h2>
                    <p className="text-gray-500 text-center text-sm mt-2">
                        A verification link was sent to{" "}
                        <span className="font-medium text-gray-700">
                            {user?.email ?? "your email"}
                        </span>
                        . Please click the link to verify your account.
                    </p>
                </div>

                {error && (
                    <p className="text-red-500 text-sm text-center mb-4">
                        {error}
                    </p>
                )}
                {resendSuccess && (
                    <p className="text-green-600 text-sm text-center mb-4">
                        Verification email sent. Please check your inbox.
                    </p>
                )}

                <label className="block text-sm font-medium text-gray-700 mb-1">
                    After clicking the link, click below.
                </label>

                <button
                    type="button"
                    className="w-full bg-black text-white py-2 rounded-lg hover:bg-gray-800"
                    onClick={onClickContinue}
                    disabled={checkingVerification}
                >
                    {checkingVerification ? "CHECKING…" : "CONTINUE"}
                </button>
                <button
                    type="button"
                    className="text-gray-500 text-center text-sm mt-2 w-full"
                    onClick={onClickResendEmail}
                    disabled={resendingEmail}
                >
                    {resendingEmail ? "Sending…" : "Send New Link"}
                </button>
            </div>
        </div>
    );
}

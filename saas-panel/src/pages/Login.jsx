import React, {
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import logo from "../assets/golden-creation-login-logo.png";

import {
  apiRequest,
  storeAdminSession,
} from "../lib/api";

const Login = ({
  onLogin,
}) => {
  const [email, setEmail] =
    useState(
      "admin@goldencreation.in"
    );

  const [password, setPassword] =
    useState("");
  const [showPassword, setShowPassword] =
    useState(false);
  const [mode, setMode] =
    useState("login");
  const [accountType, setAccountType] =
    useState("admin");
  const [otp, setOtp] =
    useState("");
  const [newPassword, setNewPassword] =
    useState("");
  const [showNewPassword, setShowNewPassword] =
    useState(false);
  const [challengeToken, setChallengeToken] =
    useState("");

  const [error, setError] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const navigate =
    useNavigate();

  const handleSubmit =
    async (event) => {
      event.preventDefault();

      setError("");

      setLoading(true);

      try {
        if (accountType === "affiliate") {
          const data =
            await apiRequest(
              "/affiliate/login",
              {
                method:
                  "POST",

                body: JSON.stringify(
                  {
                    email,
                    password,
                  }
                ),
              }
            );

          const affiliateUser = {
            ...(data.affiliate || {}),
            role: "affiliate",
            permissions: [],
          };

          storeAdminSession(
            data.token,
            affiliateUser
          );

          if (onLogin) {
            onLogin(
              affiliateUser
            );
          }

          navigate(
            "/",
            {
              replace:
                true,
            }
          );
          return;
        }

        const data =
          await apiRequest(
            "/admin/login",
            {
              method:
                "POST",

              body: JSON.stringify(
                {
                  email,
                  password,
                }
              ),
            }
          );

        if (data.requiresTwoFactor) {
          setChallengeToken(
            data.challengeToken || ""
          );
          setOtp("");
          setMode("login-otp");
          setError(
            data.message ||
              "OTP sent to your registered email"
          );
          return;
        }

        storeAdminSession(
          data.token,
          data.admin
        );

        if (onLogin) {
          onLogin(
            data.admin
          );
        }

        navigate(
          "/",
          {
            replace:
              true,
          }
        );
      } catch (
        loginError
      ) {
        console.log(
          loginError
        );

        setError(
          loginError.message ||
            "Invalid admin credentials"
        );
      } finally {
        setLoading(
          false
        );
      }
    };

  const verifyLoginOtp = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await apiRequest(
        "/admin/login/verify-otp",
        {
          method: "POST",
          body: JSON.stringify({
            email,
            otp,
            challengeToken,
          }),
        }
      );

      storeAdminSession(data.token, data.admin);
      onLogin?.(data.admin);
      navigate("/", { replace: true });
    } catch (loginError) {
      setError(
        loginError.message ||
          "Invalid OTP"
      );
    } finally {
      setLoading(false);
    }
  };

  const requestPasswordReset = async () => {
    if (!email) {
      setError("Enter your email address first");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const response = await apiRequest(
        "/admin/password-reset/request",
        {
          method: "POST",
          body: JSON.stringify({ email }),
        }
      );
      setOtp("");
      setNewPassword("");
      setMode("reset");
      setError(response.message || "OTP sent");
    } catch (resetError) {
      setError(resetError.message || "Unable to send reset OTP");
    } finally {
      setLoading(false);
    }
  };

  const completePasswordReset = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await apiRequest(
        "/admin/password-reset/verify",
        {
          method: "POST",
          body: JSON.stringify({
            email,
            otp,
            newPassword,
          }),
        }
      );
      setPassword("");
      setOtp("");
      setNewPassword("");
      setMode("login");
      setError(response.message || "Password reset successfully");
    } catch (resetError) {
      setError(resetError.message || "Unable to reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F6F3ED] px-4 py-10">
      {/* BACKGROUND */}

      <div className="absolute inset-0">
        <div className="absolute left-[-120px] top-[-120px] h-[300px] w-[300px] rounded-full bg-[#D8A14B]/20 blur-3xl"></div>

        <div className="absolute bottom-[-120px] right-[-120px] h-[320px] w-[320px] rounded-full bg-[#404C31]/20 blur-3xl"></div>
      </div>

      {/* LOGIN CARD */}

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-[32px] border border-[#E6D7BF] bg-white/95 shadow-[0_20px_60px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        {/* TOP STRIP */}

        <div className="h-2 w-full bg-gradient-to-r from-[#D8A14B] via-[#FFF49C] to-[#404C31]"></div>

        <div className="p-8 sm:p-10">
          {/* LOGO */}

          <div className="mb-8 flex flex-col items-center text-center">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl bg-[#FFF8EB] shadow-inner">
              <img
                src={logo}
                alt="Golden Creation"
                className="h-24 w-24 object-contain"
              />
            </div>

            <h1 className="mt-5 text-3xl font-bold tracking-tight text-[#242414]">
              {accountType === "affiliate" ? "Affiliate Login" : "Admin Panel"} – Golden Creation
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              {accountType === "affiliate"
                ? "Track affiliate earnings, links, and payouts"
                : "Secure access to the Golden Creation dashboard"}
            </p>
          </div>

          {/* FORM */}

          <form
            onSubmit={
              mode === "login-otp"
                ? verifyLoginOtp
                : mode === "reset"
                  ? completePasswordReset
                  : handleSubmit
            }
            className="space-y-5"
          >
            {mode === "login" && (
              <div className="grid grid-cols-2 rounded-2xl border border-[#E6D7BF] bg-[#FBF8F2] p-1 text-sm font-semibold">
                {[
                  ["admin", "Admin / Staff"],
                  ["affiliate", "Affiliate"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setAccountType(key);
                      setError("");
                    }}
                    className={`rounded-xl px-3 py-2 transition ${
                      accountType === key
                        ? "bg-white text-[#8A541E] shadow-sm"
                        : "text-gray-500"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* EMAIL */}

            <div>
              <label className="mb-2 block text-sm font-medium text-[#242414]">
                Email Address
              </label>

              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(
                    event
                  ) =>
                    setEmail(
                      event.target
                        .value
                    )
                  }
                  placeholder="Enter admin email"
                  autoComplete="email"
                  required
                  className="w-full rounded-2xl border border-[#E6D7BF] bg-[#FBF8F2] px-4 py-3 text-sm outline-none transition-all duration-200 focus:border-[#C2863F] focus:bg-white focus:ring-4 focus:ring-[#D8A14B]/20"
                />
              </div>
            </div>

            {mode === "login" && (
              <div>
                <label className="mb-2 block text-sm font-medium text-[#242414]">
                  Password
                </label>

                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    placeholder="Enter password"
                    autoComplete="current-password"
                    required
                    className="w-full rounded-2xl border border-[#E6D7BF] bg-[#FBF8F2] px-4 py-3 pr-20 text-sm outline-none transition-all duration-200 focus:border-[#C2863F] focus:bg-white focus:ring-4 focus:ring-[#D8A14B]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#8A541E]"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                {accountType === "admin" && (
                  <button
                    type="button"
                    onClick={requestPasswordReset}
                    className="mt-2 text-xs font-semibold text-[#8A541E]"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
            )}

            {mode === "login-otp" && (
              <div>
                <label className="mb-2 block text-sm font-medium text-[#242414]">
                  Email OTP
                </label>
                <input
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  placeholder="Enter 6-digit OTP"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  className="w-full rounded-2xl border border-[#E6D7BF] bg-[#FBF8F2] px-4 py-3 text-sm outline-none transition-all duration-200 focus:border-[#C2863F] focus:bg-white focus:ring-4 focus:ring-[#D8A14B]/20"
                />
              </div>
            )}

            {mode === "reset" && (
              <>
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#242414]">
                    Reset OTP
                  </label>
                  <input
                    value={otp}
                    onChange={(event) => setOtp(event.target.value)}
                    placeholder="Enter 6-digit OTP"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    className="w-full rounded-2xl border border-[#E6D7BF] bg-[#FBF8F2] px-4 py-3 text-sm outline-none transition-all duration-200 focus:border-[#C2863F] focus:bg-white focus:ring-4 focus:ring-[#D8A14B]/20"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#242414]">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="Enter new password"
                      autoComplete="new-password"
                      required
                      className="w-full rounded-2xl border border-[#E6D7BF] bg-[#FBF8F2] px-4 py-3 pr-20 text-sm outline-none transition-all duration-200 focus:border-[#C2863F] focus:bg-white focus:ring-4 focus:ring-[#D8A14B]/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((value) => !value)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#8A541E]"
                    >
                      {showNewPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ERROR */}

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* BUTTON */}

            <button
              type="submit"
              disabled={
                loading
              }
              className="group relative w-full overflow-hidden rounded-2xl bg-[#404C31] py-3.5 text-sm font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#2F3923] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"></span>

              <span className="relative z-10">
                {loading
                  ? "Please wait..."
                  : mode === "login-otp"
                    ? "Verify OTP"
                    : mode === "reset"
                      ? "Reset Password"
                      : accountType === "affiliate"
                        ? "Login to Affiliate Dashboard"
                        : "Login to Dashboard"}
              </span>
            </button>
            {mode !== "login" && (
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setOtp("");
                  setNewPassword("");
                  setChallengeToken("");
                  setError("");
                }}
                className="w-full text-center text-xs font-semibold text-[#8A541E]"
              >
                Back to login
              </button>
            )}
          </form>

          {/* FOOTER */}

          <div className="mt-8 border-t border-[#EFE7D8] pt-5 text-center">
            <p className="text-xs text-gray-500">
              © 2026 Golden Creation •
              Secure Admin Access
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

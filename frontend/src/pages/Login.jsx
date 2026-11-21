import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import logo from "../assets/golden-creation-official-logo.png";
import gmail from "../assets/gmail (1).png";
import phone from "../assets/telephone.png";
import lock from "../assets/padlock (1).png";
import arrow from "../assets/right-arrow.png";
import google from "../assets/google.png";
import info from "../assets/information.png";
import { useAppStore } from "../context/AppContext";
import {
  completeGoogleLogin,
  sanitiseUser,
  sendEmailOtp,
  sendMobileOtp,
  startGoogleLogin,
  verifyEmailOtp,
  verifyMobileOtp,
} from "../lib/api";
const Login = () => {
  const [activeTab, setActiveTab] = useState("email");
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [feedback, setFeedback] = useState("");
  const [otpPreview, setOtpPreview] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, setCurrentUser } = useAppStore();
  const redirectTo = location.state?.from || "/";

  useEffect(() => {
    if (currentUser) {
      navigate(redirectTo, { replace: true });
    }
  }, [currentUser, navigate, redirectTo]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const googleToken = params.get("google_token");
    const googleError = params.get("google_error");
    const googleRedirectTo = params.get("redirectTo") || redirectTo;

    if (googleError) {
      setFeedback("Google sign-in could not be completed. Please try again.");
      navigate("/login", { replace: true });
      return;
    }

    if (!googleToken) {
      return;
    }

    let cancelled = false;

    async function finishGoogleLogin() {
      try {
        setLoading(true);
        setFeedback("Completing Google sign-in...");
        const user = await completeGoogleLogin(googleToken);

        if (cancelled) return;

        setCurrentUser(
          sanitiseUser({
            ...user,
            loginMethod: "google",
          })
        );
        navigate(googleRedirectTo, { replace: true });
      } catch (error) {
        if (!cancelled) {
          setFeedback(error.message || "Google sign-in failed");
          navigate("/login", { replace: true });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    finishGoogleLogin();

    return () => {
      cancelled = true;
    };
  }, [location.search, navigate, redirectTo, setCurrentUser]);

  const isEmailLogin = activeTab === "email";

  const resetFlow = (nextTab) => {
    setActiveTab(nextTab);
    setIdentifier("");
    setOtp("");
    setFeedback("");
    setOtpPreview("");
    setOtpSent(false);
  };

  const validateIdentifier = () => {
    if (isEmailLogin) {
      const cleanEmail = identifier.trim().toLowerCase();
      const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);

      if (!isValidEmail) {
        throw new Error("Enter a valid email address");
      }

      return cleanEmail;
    }

    const numericPhone = identifier.replace(/\D/g, "");

    if (numericPhone.length < 10) {
      throw new Error("Enter a valid mobile number");
    }

    return numericPhone;
  };

  const requestOtp = async (options = {}) => {
    const { isResend = false } = options;
    const cleanIdentifier = validateIdentifier();

    const result = isEmailLogin
      ? await sendEmailOtp(cleanIdentifier)
      : await sendMobileOtp(cleanIdentifier);

    setOtpSent(true);
    setOtp("");
    setOtpPreview(result.otp || "");
    setFeedback(
      result.message || (isResend ? "OTP resent successfully" : "OTP sent successfully")
    );

    return cleanIdentifier;
  };

  const submitOtpVerification = async () => {
    const cleanIdentifier = validateIdentifier();

    if (!otp.trim()) {
      throw new Error("Enter the OTP to continue");
    }

    const result = isEmailLogin
      ? await verifyEmailOtp(cleanIdentifier, otp.trim())
      : await verifyMobileOtp(cleanIdentifier, otp.trim());

    setCurrentUser(
      sanitiseUser({
        ...result.user,
        loginMethod: activeTab,
        email: result.user?.email || (isEmailLogin ? cleanIdentifier : null),
        phone: result.user?.phone || (!isEmailLogin ? cleanIdentifier : null),
      })
    );

    navigate(redirectTo, { replace: true });
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setFeedback("");

      if (!otpSent) {
        await requestOtp();
        return;
      }

      await submitOtpVerification();
    } catch (error) {
      setFeedback(error.message || "Unable to complete sign in");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    try {
      setLoading(true);
      setFeedback("");
      await requestOtp({ isResend: true });
    } catch (error) {
      setFeedback(error.message || "Unable to resend OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    setFeedback("Redirecting to Google...");
    startGoogleLogin(redirectTo);
  };

  const handleHome = () => navigate("/");
  const handleTerms = () => navigate("/terms-and-conditions");
  const handlePrivacy = () => navigate("/privacy-policy");
  return (
    <div className="bg-gray-100 min-h-screen flex flex-col items-center px-4">     
      {/* HEADER */}
      <div className="text-center mt-10">
        <img src={logo} className="w-72 sm:w-80 mx-auto mb-4" />
        <button
          type="button"
          onClick={handleHome}
          className="mb-4 inline-flex items-center justify-center rounded-full border border-[#C2863F] px-4 py-2 text-sm font-semibold text-[#8A541E] transition hover:bg-[#FFF4E6]"
        >
          Back to homepage
        </button>
        <h2 className="text-base sm:text-lg font-semibold">
          Welcome back to{" "}
          <span className="text-yellow-600">Golden Creation</span></h2>
        <p className="text-xs text-gray-500 mt-1 px-4">
          Sign in to access your premium stationery collection.</p></div>
      <div className="bg-white mt-6 p-5 sm:p-6 rounded-xl shadow-md w-full max-w-md">
        <div className="flex border rounded-md overflow-hidden text-sm">
          <button onClick={() => resetFlow("email")}
            className={`flex-1 py-2 flex items-center justify-center gap-2 ${
              activeTab === "email" ? "bg-gray-200 font-medium" : ""}`} >
            <img src={gmail} className="w-4" /> Email
          </button>
          <button onClick={() => resetFlow("mobile")}
            className={`flex-1 py-2 flex items-center justify-center gap-2 ${
              activeTab === "mobile" ? "bg-gray-200 font-medium" : ""}`}>
            <img src={phone} className="w-4" />
            Mobile</button> </div>
        {/* INPUT */}
        <div className="mt-4">
          <label className="text-xs text-gray-500">
            {activeTab === "email" ? "Email Address" : "Mobile Number"}
          </label>
          <div className="flex items-center border mt-1 px-3 py-2 rounded-md gap-2">
            <img src={isEmailLogin ? gmail : phone}
              className="w-5"/>
            <input type="text" placeholder={
                isEmailLogin
                  ? "name@company.com"
                  : "Enter mobile number"}
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              className="outline-none text-sm w-full"/>
          </div>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-500">
         <label>OTP</label>
           </div>
          <div className="flex items-center border mt-1 px-3 py-2 rounded-md gap-2">
            <img src={lock} className="w-5" />
            <input type="text" placeholder="Enter OTP"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              className="outline-none text-sm w-full"/>
          </div>  </div>
        {feedback && (
          <p className="mt-3 text-xs text-[#C2863F]">{feedback}</p>
        )}
        {otpPreview && (
          <p className="mt-1 text-xs text-gray-500">
            OTP for testing: <span className="font-semibold">{otpPreview}</span>
          </p>
        )}
        <div className="flex items-center gap-1 text-xs mt-2">
          <input type="checkbox" />Keep me logged in
        </div>
        <button onClick={handleSubmit}
          disabled={loading}
          className="bg-yellow-600 hover:bg-yellow-700 transition text-white w-full py-2 mt-4 rounded-md flex items-center justify-center gap-2">
          {loading ? "Please wait..." : otpSent ? "Verify & Sign In" : "Send OTP"}
          <img src={arrow} className="w-4" />
        </button>
        {otpSent && (
          <button
            type="button"
            onClick={handleResendOtp}
            disabled={loading}
            className="mt-2 w-full rounded-md border border-[#C2863F] py-2 text-sm text-[#C2863F]"
          >
            Resend OTP
          </button>
        )}
        <p className="text-center text-xs text-gray-400 my-3">
          OR CONTINUE WITH </p>
        {/* SOCIAL */}
        <div className="flex justify-center">
          <button onClick={handleGoogle}
            className="flex w-full max-w-sm items-center justify-center gap-2 rounded-md border py-2 text-sm hover:bg-gray-100" >
            <img src={google} className="w-5" /> Google
          </button>
        </div>
      </div>
      <div className="text-center text-xs text-gray-500 mt-6 px-4 space-y-2">
        <p>Secure Checkout • SSL 256-bit • No Hidden Fees</p>
        <p> By continuing, you agree to LekhanMart's{" "}
          <span onClick={handleTerms} className="underline cursor-pointer"> Terms of Service </span>{" "}
          and{" "}
          <span onClick={handlePrivacy} className="underline cursor-pointer"> Privacy Policy </span>
        </p>
        <div className="flex justify-center items-center gap-1">
          <img src={info} className="w-4" />
          <span className="cursor-pointer hover:underline">
            Need Help? Contact Support
          </span>
        </div>
      </div>  
    </div>
  );
};
export default Login;

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest, clearAdminSession, updateStoredAdmin } from "../lib/api";
import { deleteAdminMedia, uploadAdminMedia } from "../lib/adminApi";

import profileImg from "../assets/t2.jpeg";
import cameraIcon from "../assets/camra.png";
import premiumIcon from "../assets/premium.png";
import verifyIcon from "../assets/verify.png";
import clockIcon from "../assets/clock.png";
import keyIcon from "../assets/key.png";
import arrowIcon from "../assets/right-arrow (2).png";
import userIcon from "../assets/user.png";
import locationIcon from "../assets/location.png";
import activityIcon from "../assets/clock.png";
import globeIcon2 from "../assets/globe.png";

const ProfileDetails = () => {
  const navigate = useNavigate();
  const [activeBtn, setActiveBtn] = useState("save");
  const [toggleOn, setToggleOn] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [securityOtpSending, setSecurityOtpSending] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [passwordFormOpen, setPasswordFormOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    otp: "",
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    next: false,
  });

  const [activities, setActivities] = useState([]);

  const [profileData, setProfileData] = useState({
    name: "",
    email: "",
    phone: "",
    location: "",
    username: "",
    role: "",
    status: "Active",
    memberSince: "",
    lastActivity: "",
    image: "",
    securityScore: "98/100",
  });

  const [originalProfile, setOriginalProfile] = useState({});

  useEffect(() => {
    fetchProfile();
  }, []);

  const showMessage = (
    text,
    type = "info"
  ) => {
    setMessage(text);
    setMessageType(type);
  };

  const formatProfile = (
    profile = {}
  ) => ({
    name: profile.name || "",
    email: profile.email || "",
    phone: profile.phone || "",
    location: profile.location || "",
    username: profile.username || "",
    role:
      profile.role ||
      profile.systemRole ||
      "Staff Member",
    status: profile.status || "Active",
    memberSince:
      profile.memberSince || "Not available",
    lastActivity:
      profile.lastActivity || "Not available",
    image: profile.image || "",
    securityScore:
      String(
        profile.securityScore || "98/100"
      ).includes("/")
        ? profile.securityScore
        : `${profile.securityScore}/100`,
  });

  const fetchProfile = async () => {
    try {
      setLoading(true);
      showMessage("");

      const response = await apiRequest("/admin/profile");

      const profile = response.profile || {};

      const formattedProfile =
        formatProfile(profile);

      setProfileData(formattedProfile);
      setOriginalProfile(formattedProfile);

      setToggleOn(Boolean(profile.twoFactorEnabled));

      setActivities(response.activities || []);
    } catch (error) {
      console.error("Profile fetch error:", error.message);
      showMessage(
        error.message ||
          "Unable to load profile",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    setProfileData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const formatIndianPhone = () => {
    const digits = String(profileData.phone || "").replace(/\D/g, "").slice(-10);

    if (digits.length === 10) {
      setProfileData((prev) => ({
        ...prev,
        phone: `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`,
      }));
    }
  };

  const discardChanges = () => {
    setProfileData(originalProfile);
    setActiveBtn("discard");
    showMessage("Changes discarded");
  };

  const handleSave = async () => {
    if (!profileData.name.trim()) {
      return showMessage(
        "Name is required",
        "error"
      );
    }

    if (!profileData.email.trim()) {
      return showMessage(
        "Email is required",
        "error"
      );
    }

    try {
      setSaving(true);
      setActiveBtn("save");

      const response = await apiRequest("/admin/profile", {
        method: "PUT",
        body: JSON.stringify(profileData),
      });

      const nextProfile =
        formatProfile(
          response.profile ||
            profileData
        );

      setProfileData(nextProfile);
      setOriginalProfile(nextProfile);
      updateStoredAdmin({
        id: response.profile?.id,
        name: nextProfile.name,
        email: nextProfile.email,
        phone: nextProfile.phone,
        role: nextProfile.role,
        image: nextProfile.image,
        status: nextProfile.status,
      });
      setActivities(
        response.activities ||
          activities
      );

      showMessage(
        "Profile updated successfully"
      );
    } catch (error) {
      showMessage(
        error.message,
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest("/admin/logout", {
        method: "POST",
      });
    } catch (error) {
      console.log(error);
    }

    clearAdminSession();
    window.location.href = `${import.meta.env.BASE_URL}login`;
  };

  const requestSecurityOtp = async () => {
    try {
      setSecurityOtpSending(true);
      showMessage("Sending security OTP...");
      const response = await apiRequest(
        "/admin/security/request-otp",
        {
          method: "POST",
        }
      );

      showMessage(
        response.message ||
          "Security OTP sent to your email"
      );
    } catch (error) {
      showMessage(
        error.message ||
          "Unable to send OTP. Check email configuration.",
        "error"
      );
    } finally {
      setSecurityOtpSending(false);
    }
  };

  const handleToggle2FA = async () => {
    try {
      const newValue = !toggleOn;
      const otp = window.prompt(
        `Enter the email OTP to ${newValue ? "enable" : "disable"} two-factor authentication. Use "Send OTP" first if needed.`
      );

      if (!otp) {
        return;
      }

      const response = await apiRequest("/admin/security/two-factor", {
        method: "PUT",
        body: JSON.stringify({
          enabled: newValue,
          otp,
        }),
      });

      setToggleOn(newValue);
      setActivities(
        response.activities ||
          activities
      );

      showMessage(
        response.message ||
          `Two-factor authentication ${
            newValue ? "enabled" : "disabled"
          }`
      );
    } catch (error) {
      showMessage(
        error.message,
        "error"
      );
    }
  };

  const changePassword = async () => {
    if (
      !passwordForm.currentPassword ||
      !passwordForm.newPassword ||
      !passwordForm.otp
    ) {
      showMessage(
        "Current password, new password, and email OTP are required",
        "error"
      );
      return;
    }

    try {
      const response = await apiRequest(
        "/admin/security/change-password",
        {
          method: "PUT",
          body: JSON.stringify({
            currentPassword:
              passwordForm.currentPassword,
            newPassword:
              passwordForm.newPassword,
            otp: passwordForm.otp,
          }),
        }
      );

      setActivities(
        response.activities ||
          activities
      );
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        otp: "",
      });
      setPasswordFormOpen(false);
      showMessage(
        response.message ||
          "Password changed successfully"
      );
    } catch (error) {
      showMessage(
        error.message,
        "error"
      );
    }
  };

  const uploadProfileImage = async (file) => {
    if (!file) return;

    try {
      setUploading(true);

      const media = await uploadAdminMedia(file, "admin/profile");

      const response = await apiRequest(
        "/admin/profile/upload-image",
        {
          method: "POST",
          body: JSON.stringify({
            image: media.url,
          }),
        }
      );

      setProfileData((prev) => ({
        ...prev,
        image: response.image,
      }));
      setOriginalProfile((prev) => ({
        ...prev,
        image: response.image,
      }));
      updateStoredAdmin({
        image: response.image,
      });

      showMessage("Profile image updated");
    } catch (error) {
      showMessage(
        error.message,
        "error"
      );
    } finally {
      setUploading(false);
    }
  };

  const removeProfileImage = async () => {
    const previous = profileData.image;
    try {
      const response = await apiRequest("/admin/profile/upload-image", {
        method: "POST",
        body: JSON.stringify({ image: "" }),
      });
      setProfileData((current) => ({ ...current, image: "" }));
      setOriginalProfile((current) => ({ ...current, image: "" }));
      updateStoredAdmin({ image: "" });
      if (previous) await deleteAdminMedia(previous).catch(() => null);
      showMessage(response.message || "Profile image removed");
    } catch (error) {
      showMessage(error.message, "error");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-lg font-medium">
        Loading profile...
      </div>
    );
  }

  const roleBadge = profileData.role || "Staff Member";
  const statusBadge = profileData.status === "Active" ? "Active Account" : profileData.status || "Account";
  const statusBadgeClass =
    profileData.status === "Active"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-amber-50 text-amber-700";

  return (
    <div className="min-h-screen p-6 md:p-10 bg-[linear-gradient(180deg,#FFFFFFFF_0%,#FFF49CFF_100%)]">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-black">
            Account Settings
          </h1>

          <p className="text-gray-500 text-sm md:text-base">
            Manage your professional identity and security
            preferences.
          </p>

          {message && (
            <p
              className={`text-sm mt-2 ${
                messageType === "error"
                  ? "text-red-600"
                  : "text-[#8a5b16]"
              }`}
            >
              {message}
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={discardChanges}
            className={`px-4 py-2 rounded-lg border transition ${
              activeBtn === "discard"
                ? "bg-[#A68B5BFF] text-black"
                : "bg-white text-black border-gray-300"
            }`}
          >
            Discard Changes
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-4 py-2 rounded-lg transition ${
              activeBtn === "save"
                ? "bg-[#A68B5BFF] text-black"
                : "bg-black text-white"
            } disabled:opacity-60`}
          >
            {saving
              ? "Saving..."
              : "Save All Changes"}
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-[350px]">
          <div className="bg-white rounded-2xl shadow p-6">
            <div className="h-24 bg-white rounded-xl"></div>

            <div className="flex justify-center -mt-12">
              <div className="relative">
                <img
                  src={
                    profileData.image || profileImg
                  }
                  className="h-24 w-24 rounded-full border-4 border-white object-cover"
                />

                <input
                  type="file"
                  className="hidden"
                  id="profileUpload"
                onChange={(e) =>
                  uploadProfileImage(
                    e.target.files[0]
                  )
                }
                  disabled={uploading}
                />

                <label htmlFor="profileUpload">
                <img
                  src={cameraIcon}
                    className={`h-6 w-6 absolute bottom-1 right-1 bg-white rounded-full p-1 shadow cursor-pointer ${
                      uploading
                        ? "opacity-50"
                        : ""
                    }`}
                  />
                </label>
              </div>
              <p className="mt-2 text-center text-xs text-gray-400">Recommended profile image: 600 x 600 px square.</p>
            </div>
            {profileData.image && <button type="button" onClick={removeProfileImage} className="mx-auto mt-3 block text-xs text-red-600">Remove profile image</button>}

            <div className="text-center mt-3">
              <h2 className="text-lg font-semibold">
                {profileData.name}
              </h2>

              <p className="text-gray-500 text-sm">
                {profileData.role}
              </p>
            </div>

            <div className="flex justify-center gap-2 mt-3">
              <span
                className="px-3 py-1 text-xs rounded-full bg-gray-200 text-gray-800"
              >
                {roleBadge}
              </span>

              <span
                className={`px-3 py-1 text-xs rounded-full ${statusBadgeClass}`}
              >
                {statusBadge}
              </span>
            </div>

            <hr className="my-4" />

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <div className="flex items-center gap-2 text-gray-600">
                  <img
                    src={premiumIcon}
                    className="h-4 w-4"
                  />
                  Member Since
                </div>

                <span>
                  {profileData.memberSince}
                </span>
              </div>

              <div className="flex justify-between">
                <div className="flex items-center gap-2 text-gray-600">
                  <img
                    src={verifyIcon}
                    className="h-4 w-4"
                  />
                  Security Score
                </div>

                <span className="text-[#C2863FFF]">
                  {profileData.securityScore}
                </span>
              </div>

              <div className="flex justify-between">
                <div className="flex items-center gap-2 text-gray-600">
                  <img
                    src={clockIcon}
                    className="h-4 w-4"
                  />
                  Last Activity
                </div>

                <span>
                  {profileData.lastActivity}
                </span>
              </div>
            </div>

            <button
              onClick={() =>
                showMessage(
                  "You can edit public details in the personal information form"
                )
              }
              className="w-full mt-5 py-2 rounded-lg bg-[#A68B5BFF]"
            >
              Edit Public Profile
            </button>
          </div>

          <div className="mt-4">
            <button
              onClick={handleLogout}
              className="w-full py-2 rounded-lg bg-[#A68B5BFF] text-black hover:bg-[#C2863FFF] transition text-sm font-medium"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="flex-1 bg-white rounded-2xl shadow p-6 md:p-8">
          <div className="flex items-center gap-2 mb-4">
            <img
              src={userIcon}
              className="h-5 w-5"
            />

            <h2 className="text-lg font-semibold">
              Personal Information
            </h2>
          </div>

          <p className="text-sm text-gray-500 mb-6">
            Update your basic contact details and
            physical location.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-xs text-black">
                FULL NAME
              </label>

              <input
                className="w-full mt-1 p-2 border rounded-lg"
                placeholder="Alex Silva"
                name="name"
                value={profileData.name}
                onChange={handleChange}
              />
            </div>

            <div>
              <label className="text-xs text-black">
                EMAIL ADDRESS
              </label>

              <input
                className="w-full mt-1 p-2 border rounded-lg"
                placeholder="alex@email.com"
                name="email"
                value={profileData.email}
                onChange={handleChange}
              />
            </div>

            <div>
              <label className="text-xs text-black">
                PHONE NUMBER
              </label>

              <input
                className="w-full mt-1 p-2 border rounded-lg"
                placeholder="+91 98765 43210"
                name="phone"
                value={profileData.phone}
                onChange={handleChange}
                onBlur={formatIndianPhone}
              />
            </div>

            <div>
              <label className="text-xs text-black flex items-center gap-1">
                <img
                  src={locationIcon}
                  className="h-4 w-4"
                />
                LOCATION
              </label>

              <div className="flex items-center gap-2 border rounded-lg p-2 mt-1">
                <input
                  className="w-full outline-none"
                  placeholder="Gurugram, India"
                  name="location"
                  value={profileData.location}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

          <div className="mt-8">
            <div className="border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <img
                  src={keyIcon}
                  className="h-5 w-5"
                />

                <h3 className="font-semibold">
                  Security
                </h3>
              </div>

              <div className="flex justify-between items-center mb-4 gap-3">
                <div>
                  <p className="text-sm font-medium">
                    Two-Factor Auth
                  </p>

                  <p className="text-xs text-gray-400">
                    Highly recommended
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={requestSecurityOtp}
                    disabled={securityOtpSending}
                    className="rounded-lg border px-3 py-1.5 text-xs"
                  >
                    {securityOtpSending ? "Sending..." : "Send OTP"}
                  </button>
                  <div
                    onClick={handleToggle2FA}
                    className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer ${
                      toggleOn
                        ? "bg-[#A68B5BFF]"
                        : "bg-gray-300"
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow transform ${
                        toggleOn
                          ? "translate-x-6"
                          : ""
                      }`}
                    />
                  </div>
                </div>
              </div>

              <div
                onClick={() =>
                  setPasswordFormOpen(
                    (current) =>
                      !current
                  )
                }
                className="flex justify-between items-center border p-3 rounded-lg cursor-pointer"
              >
                <span>Change Password</span>

                <img
                  src={arrowIcon}
                  className="h-4 w-4"
                />
              </div>

              {passwordFormOpen && (
                <div className="border rounded-lg p-3 mt-3 space-y-3 bg-gray-50">
                  <button
                    type="button"
                    onClick={requestSecurityOtp}
                    disabled={securityOtpSending}
                    className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold"
                  >
                    {securityOtpSending ? "Sending OTP..." : "Send password change OTP"}
                  </button>
                  <div className="relative">
                    <input
                      type={showPasswords.current ? "text" : "password"}
                      value={
                        passwordForm.currentPassword
                      }
                      onChange={(event) =>
                        setPasswordForm(
                          (current) => ({
                            ...current,
                            currentPassword:
                              event.target.value,
                          })
                        )
                      }
                      placeholder="Current password"
                      className="w-full border rounded-lg px-3 py-2 pr-16 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords((current) => ({ ...current, current: !current.current }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#8A541E]"
                    >
                      {showPasswords.current ? "Hide" : "Show"}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPasswords.next ? "text" : "password"}
                      value={
                        passwordForm.newPassword
                      }
                      onChange={(event) =>
                        setPasswordForm(
                          (current) => ({
                            ...current,
                            newPassword:
                              event.target.value,
                          })
                        )
                      }
                      placeholder="New password"
                      className="w-full border rounded-lg px-3 py-2 pr-16 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords((current) => ({ ...current, next: !current.next }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#8A541E]"
                    >
                      {showPasswords.next ? "Hide" : "Show"}
                    </button>
                  </div>
                  <input
                    value={passwordForm.otp}
                    onChange={(event) =>
                      setPasswordForm(
                        (current) => ({
                          ...current,
                          otp: event.target.value,
                        })
                      )
                    }
                    placeholder="Email OTP"
                    inputMode="numeric"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    onClick={changePassword}
                    className="w-full py-2 rounded-lg bg-[#A68B5BFF] text-sm font-medium"
                  >
                    Update Password
                  </button>
                </div>
              )}

              <p className="text-xs text-gray-400 mt-3">
                Last changed 4 days ago
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 border rounded-2xl p-5 bg-white lg:w-[65%] ml-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <img
                src={activityIcon}
                className="h-5 w-5"
              />

              <h3 className="font-semibold">
                Activity Overview
              </h3>
            </div>

            <p className="text-gray-500 text-sm mt-1">
              Recent security and operational events
              related to your account
            </p>
          </div>

          <button
            onClick={() => navigate("/activity")}
            className="text-sm text-[#A68B5BFF] font-medium"
          >
            View Full Audit Log
          </button>
        </div>

        <div className="space-y-5">
          {activities.length > 0 ? (
            activities.map((activity, index) => (
              <div
                className="flex gap-3"
                key={index}
              >
                <img
                  src={activityIcon}
                  className="h-5 w-5 mt-1"
                />

                <div>
                  <p className="text-sm font-medium">
                    {activity.title}
                  </p>

                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                    <div className="flex items-center gap-1">
                      <img
                        src={clockIcon}
                        className="h-3 w-3"
                      />
                      {activity.time}
                    </div>

                    <div className="flex items-center gap-1">
                      <img
                        src={globeIcon2}
                        className="h-3 w-3"
                      />
                      {activity.location}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500">
              No activities found.
            </p>
          )}
        </div>

        <div className="flex justify-between items-center pt-4 border-t mt-6">
          <div className="flex items-center gap-2 text-[#A68B5BFF] cursor-pointer">
            <img
              src={verifyIcon}
              className="h-4 w-4"
            />

            <span className="text-sm font-medium">
              All activities are encrypted and archived
              for 90 days
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileDetails;

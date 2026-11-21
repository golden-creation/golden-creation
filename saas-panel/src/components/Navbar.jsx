import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import searchIcon from "../assets/search.png";
import notificationIcon from "../assets/notification.png";
import questionIcon from "../assets/question.png";
import userImg from "../assets/sub1.png";
import {
  getAdminNotifications,
  markAdminNotificationsRead,
  searchAdmin,
} from "../lib/adminApi";

const Navbar = ({ admin, onLogout }) => {
  const navigate = useNavigate();
  const searchRef = useRef(null);
  const profileRef = useRef(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const canViewInbox = ["super admin", "technical developer"].includes(String(admin?.role || "").trim().toLowerCase());
  const canUseGlobalSearch = canViewInbox;

  useEffect(() => {
    if (!canViewInbox) return undefined;
    let cancelled = false;
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setSearchResults([]);
      return undefined;
    }

    const timer = setTimeout(() => {
      searchAdmin(trimmed)
        .then((payload) => {
          if (!cancelled) {
            setSearchResults(payload.results || []);
            setSearchOpen(true);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSearchResults([]);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, canViewInbox]);

  useEffect(() => {
    if (!canViewInbox) return undefined;
    let cancelled = false;

    const loadNotifications = () => {
      getAdminNotifications()
        .then((payload) => {
          if (!cancelled) {
            setNotifications(payload.notifications || []);
            setUnreadCount(payload.unreadCount || 0);
          }
        })
        .catch(() => {});
    };

    loadNotifications();
    const interval = window.setInterval(loadNotifications, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [canViewInbox]);

  useEffect(() => {
    const handler = (event) => {
      if (!searchRef.current?.contains(event.target)) {
        setSearchOpen(false);
      }

      if (!profileRef.current?.contains(event.target)) {
        setProfileOpen(false);
      }
    };

    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  const openResult = (result) => {
    setQuery("");
    setSearchOpen(false);
    navigate(result.path || "/");
  };

  const openNotifications = async () => {
    const nextOpen = !notificationsOpen;
    setNotificationsOpen(nextOpen);

    if (nextOpen && unreadCount) {
      try {
        await markAdminNotificationsRead();
        setUnreadCount(0);
        setNotifications((items) =>
          items.map((item) => ({ ...item, is_read: true }))
        );
      } catch {
        // Keep the badge if the backend cannot mark read.
      }
    }
  };

  return (
    <div className="sticky top-0 z-40 flex w-full items-center justify-between bg-white px-4 py-2.5 shadow-sm md:px-8">
      <div ref={searchRef} className="relative w-full max-w-lg">
        {canUseGlobalSearch ? (
          <div className="flex items-center rounded-md bg-gray-100 px-3 py-2">
            <img src={searchIcon} alt="search" className="h-4 w-4 opacity-60" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search orders, products, staff, modules..."
              className="ml-2 w-full bg-transparent text-[13px] outline-none"
            />
          </div>
        ) : (
          <p className="text-sm font-medium text-gray-600">Sales Workspace</p>
        )}

        {canUseGlobalSearch && searchOpen && query.trim().length >= 2 && (
          <div className="absolute left-0 right-0 top-12 z-50 max-h-96 overflow-y-auto rounded-xl border bg-white shadow-xl">
            {searchResults.length ? (
              searchResults.map((result, index) => (
                <button
                  key={`${result.type}-${result.id || result.title}-${index}`}
                  type="button"
                  onClick={() => openResult(result)}
                  className="block w-full border-b px-4 py-3 text-left last:border-b-0 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{result.title}</p>
                    <span className="rounded-full bg-[#FFF49C] px-2 py-0.5 text-[10px] text-[#6E4D13]">
                      {result.type}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {result.subtitle || "Open result"}
                  </p>
                </button>
              ))
            ) : (
              <div className="px-4 py-6 text-center text-sm text-gray-500">
                No admin results found.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="ml-4 flex items-center gap-3 md:gap-5">
        {canViewInbox && <div className="relative">
          <button type="button" onClick={openNotifications} className="relative">
            <img src={notificationIcon} alt="notification" className="h-5 w-5" />
            {unreadCount ? (
              <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] text-white">
                {unreadCount}
              </span>
            ) : null}
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 top-9 z-50 w-80 overflow-hidden rounded-xl border bg-white shadow-xl">
              <div className="border-b px-4 py-3">
                <p className="text-sm font-semibold">Notifications</p>
                <p className="text-xs text-gray-500">New orders and admin alerts</p>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length ? (
                  notifications.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setNotificationsOpen(false);
                        navigate(item.link || "/orders");
                      }}
                      className="block w-full border-b px-4 py-3 text-left last:border-b-0 hover:bg-gray-50"
                    >
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="mt-1 text-xs text-gray-500">{item.message}</p>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-6 text-center text-sm text-gray-500">
                    No notifications yet.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>}
        <div className="cursor-pointer">
          <img src={questionIcon} alt="help" className="h-5 w-5 opacity-80" />
        </div>
        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((current) => !current)}
            className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-gray-100"
          >
            <img
              src={admin?.image || userImg}
              alt="user"
              className="h-8 w-8 rounded-full object-cover"
            />
            <div className="hidden text-left md:block">
              <p className="text-[13px] font-semibold leading-tight">{admin?.name || "Admin"}</p>
              <p className="text-[11px] text-gray-500">{admin?.role || "Admin Access"}</p>
            </div>
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border bg-white shadow-xl">
              <div className="border-b px-4 py-3">
                <p className="text-sm font-semibold">{admin?.name || "Admin"}</p>
                <p className="text-xs text-gray-500">{admin?.email || admin?.role || "Admin Access"}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  navigate("/profile");
                }}
                className="block w-full px-4 py-3 text-left text-sm hover:bg-gray-50"
              >
                Profile Details
              </button>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  onLogout();
                }}
                className="block w-full border-t px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Navbar;

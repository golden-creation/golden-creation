import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import addIcon from "../assets/add.png";
import uploadIcon from "../assets/upload.png";
import infoIcon from "../assets/information (2).png";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import calendarIcon from "../assets/calendar1.png";
import { useRef } from "react";
import { createAdminCategory, uploadAdminMedia } from "../lib/adminApi";
import RemoteLookup from "../components/RemoteLookup";

const AddCategory = () => {
  const navigate = useNavigate();
  const [active, setActive] = useState(true);
  const [selectedBtn, setSelectedBtn] = useState("publish");
  const [date, setDate] = useState(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [parent, setParent] = useState(null);
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState("");
  const datePickerRef = useRef(null);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2500);
  };

  const handleSubmit = () => {
    createAdminCategory({
      name,
      description,
      parent_id: parentId ? Number(parentId) : null,
      image,
      status: active ? "Active" : "Inactive",
    })
      .then(() => {
        showToast("Category created successfully");
        setTimeout(() => navigate("/categories"), 700);
      })
      .catch((error) => showToast(error.message || "Unable to create category"));
  };
  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const media = await uploadAdminMedia(file, "categories");
      setImage(media.url || media.image || media.path || "");
    } catch (error) {
      showToast(error.message || "Unable to upload category image");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  return (
    <div className="w-full max-w-full overflow-hidden md:overflow-visible p-4 sm:p-6 bg-[#F8F6F2] min-h-screen">
      {toast && <div className="fixed top-5 right-5 bg-black text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">{toast}</div>}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Add New Category</h1>
          <p className="text-gray-500 text-sm">Set up a new classification for your premium product collections.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => navigate(-1)} className="px-4 py-2 bg-gray-200 rounded-lg text-sm">Cancel</button>
          <button onClick={handleSubmit} className="px-4 py-2 bg-[#A68B5BFF] text-white rounded-lg flex items-center gap-2 text-sm">
            <img src={addIcon} className="h-4" />
            Create Category
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white p-5 rounded-xl shadow w-full">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <img src={infoIcon} className="h-4" />
              Basic Information
            </h3>
            <div className="grid sm:grid-cols-2 gap-4 mb-3">
              <div>
                <label className="text-sm font-medium">Category Name *</label>
                <input value={name} onChange={(event) => setName(event.target.value)} className="border p-2 rounded w-full mt-1" placeholder="Modern Living" />
                {!name.trim() && <p className="text-xs text-gray-400 mt-1">This field is required before saving</p>}
              </div>
              <div>
                <label className="text-sm font-medium">URL Slug</label>
                <input value={name ? `/shop/${name.toLowerCase().replace(/\s+/g, "-")}` : ""} readOnly className="border p-2 rounded w-full mt-1 bg-gray-50" placeholder="/shop/modern-living" />
                <p className="text-xs text-gray-400 mt-1">Generated automatically from name</p>
              </div>
            </div>
            <div className="mb-3">
              <label className="text-sm font-medium">Description</label>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="w-full border p-2 rounded mt-1" placeholder="Describe what items are included in this category..." />
              <p className="text-xs text-gray-400 mt-1">Saved with the category and shown in the nested category manager.</p>
            </div>
            <div>
              <label className="text-sm font-medium">Parent Category</label>
              <RemoteLookup type="categories" value={parent} onChange={(option) => { setParent(option); setParentId(option?.id || ""); }} placeholder="None - top level category" />
              <p className="text-xs text-gray-400 mt-1">Choose a parent to create this as a subcategory.</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl shadow w-full">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <img src={uploadIcon} className="h-4" />
              Media & Assets
            </h3>
            <label className="block cursor-pointer border-2 border-dashed p-6 rounded-lg text-center w-full">
              <img src={uploadIcon} className="h-6 mx-auto mb-2" />
              <p className="text-sm text-gray-600">Click to upload or drag and drop</p>
              <p className="text-xs text-gray-400 mt-1">Top-level category images are used on the website homepage.</p>
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              {uploading && <p className="mt-3 text-xs text-[#8A5A22]">Uploading image...</p>}
              {image && <img src={image} className="mt-4 mx-auto h-24 max-w-full rounded object-cover" />}
            </label>
          </div>
        </div>

        <div className="space-y-6 w-full md:max-w-full">
          <div className="bg-white p-5 rounded-xl shadow">
            <h3 className="font-semibold mb-3">Visibility & Status</h3>
            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-sm font-medium">Active Status</p>
                <p className="text-xs text-gray-400">Make this category visible on site</p>
              </div>
              <div onClick={() => setActive(!active)} className={`w-10 h-5 flex items-center rounded-full p-1 cursor-pointer ${active ? "bg-[#C2863FFF]" : "bg-gray-300"}`}>
                <div className={`bg-white w-4 h-4 rounded-full shadow transform duration-300 ${active ? "translate-x-5" : ""}`} />
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">SCHEDULE PUBLICATION</p>
              <div className="relative">
                <DatePicker ref={datePickerRef} selected={date} onChange={(d) => setDate(d)} showTimeSelect dateFormat="Pp" className="border p-2 pr-10 rounded w-full" popperPlacement="bottom-start" />
                <img src={calendarIcon} alt="calendar" onClick={() => datePickerRef.current.setOpen(true)} className="absolute right-3 top-1/2 -translate-y-1/2 h-4 cursor-pointer" />
              </div>
            </div>
          </div>

          <div className="bg-[#FFF7ED] border border-orange-200 p-4 rounded-xl flex gap-2">
            <img src={infoIcon} className="h-4 mt-1" />
            <div>
              <p className="text-sm font-semibold text-[#C2863FFF]">Backend Note</p>
              <p className="text-xs text-gray-600 mt-1">This form writes nested categories through the admin category API.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 border-t pt-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-xs text-gray-400">Ready to save to backend</p>
        <div className="flex gap-3 flex-wrap justify-center md:justify-end w-full md:w-auto">
          <button onClick={() => setSelectedBtn("draft")} className={`px-4 py-2 rounded-lg text-sm ${selectedBtn === "draft" ? "bg-[#C2863FFF] text-white" : "bg-white border"}`}>Save as Draft</button>
          <button onClick={handleSubmit} className={`px-4 py-2 rounded-lg text-sm ${selectedBtn === "publish" ? "bg-[#C2863FFF] text-white" : "bg-white border"}`}>Publish Category</button>
        </div>
      </div>
    </div>
  );
};

export default AddCategory;

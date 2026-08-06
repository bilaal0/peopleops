import { useState, useEffect } from "react";
import { Form } from "react-router-dom";
import Button from "../ui/Button";
import { validateAgency } from "../../utils/validator";
import { getAgencyLogoUrl } from "../../utils/agencyLogo.js";
import UKAddressFields from "../ui/UKAddressFields.jsx";

export default function AgencyForm({ 
  initialData = {}, 
  onCancel,
  submitLabel = "Save Agency",
  serverErrors = {} 
}) {
  // Only keep state for UI logic (conditional rendering) + Image Preview
  const [isBranch, setIsBranch] = useState(initialData.isBranch || false);
  const [imagePreview, setImagePreview] = useState(() => getAgencyLogoUrl(initialData.image));
  
  useEffect(() => {
    if (initialData.image) {
      setImagePreview(getAgencyLogoUrl(initialData.image));
    }
  }, [initialData.image]);

  // Errors from server
  const [errors, setErrors] = useState(serverErrors || {});

  // Sync server errors if they change (e.g., from actionData)
  if (serverErrors && Object.keys(serverErrors).length > 0 && Object.keys(errors).length === 0) {
      setErrors(serverErrors);
  }

  const handleFileChange = (e) => {
      const file = e.target.files[0];
      if (file) {
          // Create object URL for preview
          const objectUrl = URL.createObjectURL(file);
          setImagePreview(objectUrl);
      }
  };

  return (
    <Form encType="multipart/form-data" method="post" className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 w-full">
      {/* Error Message */}
      {errors.submit && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {errors.submit}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Basic Info & Logo */}
        <div className="lg:col-span-2 space-y-6">
             <h3 className="text-xl font-semibold text-gray-900 border-b pb-2 mb-4">Agency Details</h3>
             
             {/* Logo Upload - Moved to top */}
             <div className="flex items-start gap-6">
                 <div className="w-24 h-24 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden shrink-0">
                     {imagePreview ? (
                         <img src={imagePreview} alt="Logo Preview" className="w-full h-full object-cover" />
                     ) : (
                         <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                         </svg>
                     )}
                 </div>
                 <div className="flex-1">
                     <label className="block text-sm font-medium text-gray-700 mb-2">Agency Logo</label>
                     <input 
                        name="image"
                        type="file" 
                        accept="image/*"
                        onChange={handleFileChange}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 transition-colors"
                     />
                     <p className="mt-1 text-xs text-gray-500">PNG, JPG up to 2MB</p>
                 </div>
             </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Agency Name <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        name="name"
                        defaultValue={initialData.name}
                        placeholder="e.g., Smith & Co Lettings"
                        className={`block w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                            errors.name ? "border-red-500" : "border-gray-300"
                        }`}
                    />
                    {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Slug <span className="text-sm font-normal text-gray-500">(Optional)</span>
                    </label>
                    <input
                        type="text"
                        name="slug"
                        defaultValue={initialData.slug}
                        placeholder="e.g., legalet-hq"
                        className="block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Status
                    </label>
                    <select
                        name="status"
                        defaultValue={initialData.status || "active"}
                        className="block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    >
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                    </select>
                </div>
            </div>
            
            {/* Primary Admin Details */}
             <div className="mt-8 pt-6 border-t border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Primary Admin Reference</h3>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Title
                            </label>
                            <select
                                name="title"
                                defaultValue={initialData.title}
                                className={`block w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                                    errors.title ? "border-red-500" : "border-gray-300"
                                }`}
                            >
                                <option value="">Select Title</option>
                                {["Mr", "Mrs", "Miss", "Ms", "Dr", "Prof", "Sir", "Other"].map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                First Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                name="firstName"
                                defaultValue={initialData.firstName}
                                placeholder="e.g., John"
                                className={`block w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                                    errors.firstName ? "border-red-500" : "border-gray-300"
                                }`}
                            />
                            {errors.firstName && <p className="mt-1 text-sm text-red-600">{errors.firstName}</p>}
                        </div>

                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Last Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                name="lastName"
                                defaultValue={initialData.lastName}
                                placeholder="e.g., Doe"
                                className={`block w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                                    errors.lastName ? "border-red-500" : "border-gray-300"
                                }`}
                            />
                            {errors.lastName && <p className="mt-1 text-sm text-red-600">{errors.lastName}</p>}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Email Address <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="email"
                                name="email"
                                defaultValue={initialData.email}
                                placeholder="e.g., admin@example.com"
                                className={`block w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                                    errors.email ? "border-red-500" : "border-gray-300"
                                }`}
                            />
                            {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
                        </div>

                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Phone Number <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="tel"
                                name="phone"
                                defaultValue={initialData.phone}
                                placeholder="e.g., +44 7700 900000"
                                className={`block w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                                    errors.phone ? "border-red-500" : "border-gray-300"
                                }`}
                            />
                             {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone}</p>}
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                        <UKAddressFields
                            values={initialData}
                            errors={serverErrors}
                            title="Organization Address"
                            requiredFields={{ addressLine1: false, city: false, postcode: false }}
                        />
                    </div>

                </div>
            </div>
        </div>

        {/* Right Column: Settings & Limits */}
        <div className="lg:col-span-1 space-y-6 bg-gray-50 p-6 rounded-lg h-fit">
            <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2 mb-4">Configuration</h3>
            
            {/* Branch Logic */}
            <div>
                 <div className="flex items-center mb-3">
                    <input
                        type="checkbox"
                        id="isBranch"
                        name="isBranch"
                        checked={isBranch}
                        onChange={(e) => setIsBranch(e.target.checked)}
                        className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                    />
                    <label htmlFor="isBranch" className="ml-2 block text-sm text-gray-900 font-medium">
                        Is this a Branch Office?
                    </label>
                </div>
                
                {isBranch && (
                    <div className="mb-4 animate-fade-in-down">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Parent Agency ID <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            name="parentId"
                            defaultValue={initialData.parentId}
                            placeholder="Agency ID"
                            className={`block w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                            errors.parentId ? "border-red-500" : "border-gray-300"
                            }`}
                        />
                        {errors.parentId && <p className="mt-1 text-sm text-red-600">{errors.parentId}</p>}
                    </div>
                )}
            </div>

            {/* Plan Tier */}
            <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Plan Tier</label>
                  <select
                      name="planTier"
                      defaultValue={initialData.plan?.tier || "free"}
                      className="block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  >
                      <option value="free">Free</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                  </select>
            </div>

            <div className="space-y-4 pt-2">
                <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Property Limit</label>
                    <input
                        type="number"
                        name="propertyLimit"
                        defaultValue={initialData.plan?.propertyLimit ?? 5}
                        min="0"
                        className="block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                     {errors.propertyLimit && <p className="mt-1 text-sm text-red-600">{errors.propertyLimit}</p>}
                </div>
                <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">User Limit</label>
                    <input
                        type="number"
                        name="userLimit"
                        defaultValue={initialData.plan?.userLimit ?? 2}
                        min="0"
                        className="block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                     {errors.userLimit && <p className="mt-1 text-sm text-red-600">{errors.userLimit}</p>}
                </div>
                <div className="flex items-center pt-2">
                    <input
                        type="checkbox"
                        id="canCreateBranches"
                        name="canCreateBranches"
                        defaultChecked={initialData.plan?.canCreateBranches || false}
                        className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                    />
                    <label htmlFor="canCreateBranches" className="ml-2 block text-sm text-gray-900">
                        Can Create Branches?
                    </label>
                </div>
            </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-gray-200">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="px-6"
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" className="px-6">
          {submitLabel}
        </Button>
      </div>
    </Form>
  );
}

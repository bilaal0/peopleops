export const searchAddress = async (query) => {
  // Keeping this for backwards compatibility if needed, but returning empty.
  return [];
};

export const lookupPostcode = async (postcode) => {
  if (!postcode || postcode.length < 5) return null;

  try {
    const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.trim())}`);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.status === 200 && data.result) {
      return {
        postcode: data.result.postcode,
        city: data.result.admin_district || data.result.parliamentary_constituency || data.result.primary_care_trust || "",
        county: data.result.admin_county || data.result.region || "",
        country: data.result.country || "England",
        longitude: data.result.longitude,
        latitude: data.result.latitude,
      };
    }
  } catch (error) {
    console.error("Error looking up postcode:", error);
  }
  return null;
};

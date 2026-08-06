/**
 * Utility function to get the displayable URL for an agency logo.
 * Handles S3 keys, local paths, HTTP URLs, data URLs, and default fallback.
 * 
 * @param {string|null|undefined} image 
 * @returns {string|null}
 */
export function getAgencyLogoUrl(image) {
  if (!image || image === "no-image.png") {
    return null;
  }
  
  if (
    image.startsWith("http://") || 
    image.startsWith("https://") || 
    image.startsWith("data:") || 
    image.startsWith("/")
  ) {
    return image;
  }

  // Treat as S3 key
  return `/documents/s3-download?key=${encodeURIComponent(image)}`;
}

var EXTERNAL_VIEWERS = {
	"google_docs": {
		"type": "web",
		"name": "Google Docs Viewer",
		"url": "https://docs.google.com/viewer?url=${url}",
		"mime_types": [
			"*/*"
		],
		"r_mime_types": /^(?:.+\/.+)$/i
	},
	"pdfjs": {
		"type": "extension",
		"name": "PDF Viewer (PDF.js)",
		"url": "chrome-extension://${extensionid}/content/web/viewer.html?file=${url}",
		"extensionids": [
			"oemmndcbldboiebfnladdacbdfmadadm",
			"encfpfilknmenlmjemepncnlbbjlabkc"
		],
		"mime_types": [
			"application/pdf"
		],
		"r_mime_types": /^(?:application\/pdf)$/i
	}
};
var EXTERNAL_VIEWERS_EXTENSION_IDS = {
	"oemmndcbldboiebfnladdacbdfmadadm": "pdfjs",
	"encfpfilknmenlmjemepncnlbbjlabkc": "pdfjs"
};

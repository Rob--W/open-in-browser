'use strict';
/* exported EXTERNAL_VIEWERS */

var EXTERNAL_VIEWERS = {
	"google_docs": {
		"type": "web",
		"name": "Google Docs Viewer",
		"url": "https://docs.google.com/viewer?url=${url}",
		"mime_types": [
			"*/*"
		],
		"r_mime_types": /^(?:.+\/.+)$/i
	}
};

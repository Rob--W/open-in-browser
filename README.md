# Open in Browser
A browser extension that offers the ability to open files directly in the browser instead of downloading them.
You can also change the MIME-type if you wish, and choose to remember the preferred action per file-type.


## Installation

This extension has not been published yet.

### Firefox
Development: Visit about:debugging and load the extension/ directory.

### Chrome
The extension does not work in Chromium-based browsers such as Chrome or Opera
because the `webRequest` API does not support non-blocking asynchronous return values.


## Development

- The extension can directly be loaded from the extension/ directory.
- The extension extracts the icons, translations and MIME-mappings from external sources. These can
  be generated using the gen-\*.js files at the top of the repository.
- To test whether the extension works, run `npm run-script test-server` (set the `PORT` environment
  variable if the default port is in use) and open the displayed URL in the browser.


## History

The main inspiration is https://addons.mozilla.org/en-US/firefox/addon/open-in-browser/

This project was written in 2013, in an attempt to port the functionality of the Open in Browser
Firefox add-on to Chrome. However, it was never published because the only way to allow the user to
make a choice is to use the blocking `window.showModalDialog` API. But resulted in a terrible user
experience because the browser would suspend all requests until the extension had returned.

In 2017, the project was revived, this time to port the functionality to Firefox, where extensions
have to be written using the WebExtensions API - similar to Chrome's extension API. Contrary to
Chrome, Firefox's `webRequest` API allows extension to suspend network requests in a non-blocking
way, so it is feasible to show a non-blocking dialog to ask for input.

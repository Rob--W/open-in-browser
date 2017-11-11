'use strict';
/* exported ModalDialog */

/**
 * ModalDialog. Usage:
 *
 * var dialog = new ModalDialog({url, incognito: false});
 * // Optional: call dialog.close() to close before the dialog initiates close.
 * let returnValue = await dialog.show();
 *
 * // In the dialog:
 * chrome.runtime.sendMessage({action: 'setReturnValue', returnValue: ... });
 */
class ModalDialog {
    constructor({url, incognito = false}) {
        this._url = url;
        this._incognito = incognito;
    }
    async show() {
        let tabId;
        let returnValues = new Map();
        let onMessage = (msg, sender) => {
            if (!sender.tab || !msg || msg.action !== 'setReturnValue') return;
            if (tabId === sender.tab.id) {
                returnValues.clear();
                returnValues.set(sender.tab.id, msg.returnValue);
                chrome.tabs.remove(tabId);
            } else if (!tabId) {
                // If tabId is not known but we got a message, then maybe the
                // dialog has sent a message before windows.create returned.
                returnValues.set(sender.tab.id, msg.returnValue);
            }
        };
        chrome.runtime.onMessage.addListener(onMessage);

        let onTabsRemoved;
        let tabRemovedPromise = new Promise(resolve => {
            onTabsRemoved = (closingTabId) => {
                if (closingTabId === tabId) {
                    chrome.tabs.onRemoved.removeListener(onTabsRemoved);
                    resolve();
                }
            };
            chrome.tabs.onRemoved.addListener(onTabsRemoved);
        });

        try {
            let {tabs: [tab]} = await browser.windows.create({
                type: 'popup',
                url: this._url,
                width: 335,
                height: 150,
                incognito: this._incognito,
            });
            tabId = tab.id;
        } catch (e) {
            console.error(`Failed to open dialog: ${e}`);
        }
        if (tabId) {
            if (this._wantsClose) {
                chrome.tabs.remove(tabId);
            } else {
                this._close = () => {
                    chrome.tabs.remove(tabId);
                    this._close = null;
                };
                await tabRemovedPromise;
                this._close = null;
            }
        } else {
            // Failed to open window.
            chrome.tabs.onRemoved.removeListener(onTabsRemoved);
        }
        chrome.runtime.onMessage.removeListener(onMessage);
        return returnValues.get(tabId);
    }

    close() {
        this._wantsClose = true;
        if (this._close) {
            this._close();
        }
    }
}

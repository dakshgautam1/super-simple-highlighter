/*global angular, _storage, _stylesheet, _stringUtils, _i18n, _changelog, _libraries, _licenses*/

/*
 * This file is part of Super Simple Highlighter.
 * 
 * Super Simple Highlighter is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * Super Simple Highlighter is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with Foobar.  If not, see <http://www.gnu.org/licenses/>.
 */

// disable console log
// console.log = function () { }
// console.assert = function () { }

/**
 * Controllers module
 * @type {ng.IModule}
 */
var optionsControllers = angular.module('optionsControllers', []);

// TODO: rewrite, this is too linked with storage stuff

// array this is something to do with minification
optionsControllers.controller('StylesController', ["$scope", "$timeout", function ($scope, $timeout) {
    'use strict';

    // modal dialog div
    var modalElement;

    // model
    // $scope.unselectAfterHighlight = true;
    $scope.highlightClassName = "highlight";
    //    $scope.html_highlight_keyboard_shortcut_help = $sce.trustAsHtml(
    //        chrome.i18n.getMessage("html_highlight_keyboard_shortcut_help"));

    function onInit() {
        // cache
        modalElement = document.getElementById('myModal')

        // 1 - get storage value, and set up a watch on it
        _storage.getValue("unselectAfterHighlight").then(function (unselect) {
            $scope.unselectAfterHighlight = unselect;

            $scope.$watch('unselectAfterHighlight', function (newVal, oldVal) {
                if (newVal !== oldVal) {
                    console.log(newVal);

                    _storage.setValue(newVal, "unselectAfterHighlight")
                }
            });
        });

        // 1b - same, but for disable box shadow
        _storage.getValue("enableHighlightBoxShadow").then(isEnabled => {
            $scope.isHighlightBoxShadowEnabled = isEnabled;

            $scope.$watch('isHighlightBoxShadowEnabled', function (newVal, oldVal) {
                if (newVal !== oldVal) {
                    console.log(newVal);

                    _storage.setValue(newVal, "enableHighlightBoxShadow")
                }
            });
        });

        // 2
        _storage.getValue("highlightBackgroundAlpha").then(opacity => {
            if (opacity === undefined) {
                return;
            }

            $scope.opacity = opacity;

            // watch our model, sync on change
            var timeout = null;     // debounce

            $scope.$watch('opacity', function (newVal, oldVal) {
                if (newVal !== oldVal) {
                    // save the new value. debounce for 1 second
                    if (timeout) {
                        $timeout.cancel(timeout);
                    }

                    timeout = $timeout(function () {
                        console.log(newVal);

                        _storage.setValue(newVal, "highlightBackgroundAlpha")
                    }, 1000);
                }
            });
        });

        // shortcut commands array
        chrome.commands.getAll(function (commands) {
            $scope.commands = commands;
        });

        // listen for edit modal close
        //        $modal.on('hidden.bs.modal', onModalHidden);

        // listen for changes to styles
        chrome.storage.onChanged.addListener(onStorageChanged);

        // fake a change for initial update
        resetStylesheetHighlightStyle();
    }

    /**
     * Get the current highlight definitions, and (re)create the stylesheet for us using them
     * @private
     */
    function resetStylesheetHighlightStyle() {
        return _storage.highlightDefinitions.getAll_Promise().then(function (result) {
            onStorageChanged({
                sharedHighlightStyle: {
                    newValue: result.sharedHighlightStyle
                },
                highlightDefinitions: {
                    newValue: result.highlightDefinitions
                }
            }, "sync");
        });

    }

    $scope.onClickModalSave = function () {
        $(modalElement).modal('hide');

        // set contents of selectedDefintion into storage
        if ($scope.modalDefinition) {
            return _storage.highlightDefinitions.set_Promise($scope.modalDefinition);
        } else {
            return Promise.reject(new Error());
        }
    };

    /**
     * Clicked the 'add new definition' button
     */
    $scope.onClickAdd = function () {
        // default new definition
        $scope.modalTitle = chrome.i18n.getMessage("create_new_style");
        $scope.modalSaveButtonTitle = chrome.i18n.getMessage("create");

        $scope.modalDefinition = _storage.highlightDefinitions.create();
        //        $scope.$apply();

        // activate the 'edit' model
        $(modalElement).modal();
    };

    /**
     * Clicked the 'reset styles' button
     */
    $scope.onClickReset = function () {
        if (window.confirm(chrome.i18n.getMessage("confirm_reset_default_styles"))) {
            return _storage.highlightDefinitions.removeAll_Promise();
        } else {
            return Promise.resolve();
        }
    };

    /**
     * Clicked an existing definition
     * @param {number} index index of definition in local array
     */
    $scope.onClickEdit = function (index) {
        $scope.modalTitle = chrome.i18n.getMessage("edit_style");
        $scope.modalSaveButtonTitle = chrome.i18n.getMessage("update");

        // deep copy
        $scope.modalDefinition = angular.copy($scope.definitions[index]);//   _highlightDefinitions.copy($scope.definitions[index]);

        // activate the 'edit' model
        $(modalElement).modal();
    };

    /**
     * Clicked the per-definition 'delete' button
     * @param className
     */
    $scope.onClickDelete = function (className) {
        if (window.confirm(chrome.i18n.getMessage("confirm_remove_style"))) {
            // delete from storage. model should update automatically
            return _storage.highlightDefinitions.remove_Promise(className);
        } else {
            return Promise.resolve();
        }
    };

    /**
     * A value in the storage changed
     * @param changes
     * @param namespace
     */
    var onStorageChanged = function (changes, namespace) {
        if (namespace === "sync") {
            // changes is an Object mapping each key that changed to its
            // corresponding storage.StorageChange for that item.
            var change;

            if (changes.highlightBackgroundAlpha) {
                change = changes.highlightBackgroundAlpha;

                if (change.newValue) {
                    $scope.opacity = change.newValue;

                    // get all the highlights using the new opacity, and set them
                    resetStylesheetHighlightStyle();
                }
            }

            var disableBoxShadow = true;

            // default FIRST
            if (changes.sharedHighlightStyle) {
                change = changes.sharedHighlightStyle;

                if (change.oldValue) {
                    _stylesheet.clearHighlightStyle($scope.highlightClassName);
                }

                if (change.newValue) {
                    _stylesheet.setHighlightStyle({
                        className: $scope.highlightClassName,
                        style: change.newValue,
                        disableBoxShadow: disableBoxShadow,
                    });
                }
            }

            // specific last
            if (changes.highlightDefinitions) {
                change = changes.highlightDefinitions;

                if (change.oldValue) {
                    change.oldValue.forEach(function (h) {
                        _stylesheet.clearHighlightStyle(h.className);
                    });
                }

                // if we remove all teh styles (with reset button), newValue will be undefined.
                // so in that case, get the default styles
                var setDefinitions = function (definitions) {
                    // update model
                    $scope.definitions = definitions;
                    $scope.$apply();

                    // update stylesheet
                    definitions.forEach(function (definition) {
                        definition.disableBoxShadow = disableBoxShadow;
                        _stylesheet.setHighlightStyle(definition);
                    });
                };

                if (!change.newValue) {
                    // get defaults
                    _storage.highlightDefinitions.getAll_Promise().then(function (items) {
                        setDefinitions(items.highlightDefinitions);
                    });
                } else {
                    setDefinitions(change.newValue);
                }
            }
        }
    };

    onInit();
}]);


    // add event listener to document for mouseover on page-text-list-item (highlight texts)
    document.addEventListener('mouseenter', function (event) {
        const elm = event.target
        
        if (!(elm.classList && elm.classList.contains('page-text-list-item'))) {
            return
        }

        // remove hysteresis timer
        if (typeof elm.hysteresisTimeoutID === 'number') {
            clearTimeout(elm.hysteresisTimeoutID)
            delete elm.hysteresisTimeoutID
        }

        // show close button
        const closeElm = elm.querySelector('.list-item-close')
        closeElm.style.setProperty('opacity', '1')

        // // the handler applies to all spans of the highlight, so first look for 'firstSpan' (which should
        // // have the 'closeable' class)
        // const span = target.firstSpan;// $(this).prop('firstSpan');

        // // remove hysteresis timer from the first span
        // if (span.mouseLeaveHysteresisTimeoutID != null) {
        //     // cancel scheduled out transition
        //     clearTimeout(span.mouseLeaveHysteresisTimeoutID);
        //     span.mouseLeaveHysteresisTimeoutID = null;
        // }

        // const style = span.querySelector('.close').style;

        // // transition in
        // style.setProperty('opacity', '1')
        // style.setProperty('transform', 'scale(1.0)')
    }, { capture: true, passive: true })

    // add event listener for leaving highlight text
    document.addEventListener('mouseleave', function (event) {
        const elm = event.target
        
        if (!(elm.classList && elm.classList.contains('page-text-list-item'))) {
            return
        }

        const closeElm = elm.querySelector('.list-item-close')

        // add a timeout once we leave the element. If we return we cancel the transition out
        elm.hysteresisTimeoutID = setTimeout(() => {
            // transition out wasn't cancelled
            delete elm.mouseLeaveHysteresisTimeoutID

            closeElm.style.setProperty('opacity', '0')
        }, 500);
    }, { capture: true, passive: true })


/**
 * Controller for Sites pane
 */
optionsControllers.controller('PagesController', ["$scope", function ($scope) {
    'use strict';
    var backgroundPage

    // docs before grouping
    let _docs = []

    $scope.options = {
        // groupBy: {string}
        // ascendingOrder: {Boolean}
        // showPageText: {Boolean}
    }

    // text of the filter
    $scope.documentFilterText = ""

    // filter predicates
    $scope.filters = {
        // filter predicate called on individual groups
        // (delegates to document filter)
        group: (group) => group.docs.some(doc => $scope.filters.document(doc)),

        // filter predicate called on individual documents of a group
        document: (doc) => {
            const t = $scope.documentFilterText.toLowerCase()

            // always check title & match (url), optionally check page text objects
            return t.length === 0 ||
                (typeof doc.title === 'string' && doc.title.toLowerCase().indexOf(t) != -1) ||
                (doc.match.toLowerCase().indexOf(t) != -1) || (
                    $scope.options.showPageText &&
                    doc.texts.some(o => {
                        // text may have introduced undefined (see context_menus)
                        return typeof o.text === 'string' && o.text.toLowerCase().indexOf(t) != -1
                    })
                )
        }
    }


    // starter
    chrome.runtime.getBackgroundPage(bp => {
        backgroundPage = bp;

        // build default options object
        _storage.getValue("options_bookmarks_group_by").then(groupBy => {
            $scope.options.groupBy = groupBy
            return _storage.getValue("options_bookmarks_ascending_order")
        }).then(ascendingOrder => {
            $scope.options.ascendingOrder = ascendingOrder
            return _storage.getValue("options_bookmarks_show_page_text")
        }).then(showPageText => {
            $scope.options.showPageText = showPageText

            // get an array of each unique match, and the number of associated documents (which is of no use)
            return backgroundPage._database.getMatchSums_Promise()
        }).then(rows => {
            // $scope.rows = rows.filter(row => row.value > 0)
            // $scope.$apply();

            // the key for each row (item in the array) is the 'match' for each document, 
            // and the value is the sum ('create'+1, 'delete'-1)
            return Promise.all(rows.filter(row => row.value > 0)
                .map(row => backgroundPage._database.getDocuments_Promise(row.key, {
                    descending: false,
                    limit: 1   
                }))
            )
        }).then(a => {
            // each entry in docs array is an array containing at most one doc
            const docs = a.filter(a => a.length === 1).map(a => a[0])
            // first doc should always be a 'create'
            console.assert(docs.every(doc => doc.verb === 'create'))

            // if we're grouping by last_date (date of the last non-deleted 'create' document),
            // or showing text for each highlight, we need to get all create documents too
            return Promise.all(docs.map(doc => {
                return backgroundPage._database.getCreateDocuments_Promise(doc.match).then(a => {
                    // if the first create document has a corresponding delete document, then the title (stored only
                    // on the first document) will be removed along with the create document.
                    console.assert(a.length >= 1)
                    
                    // So we go through this dance.
                    if (a.length >= 1 && a[0]._id !== doc._id) {
                        a[0].title = doc.title
                    }

                    return a
                })
            }))
        }).then(createDocs => {
            // we have an array of array of createDocs

            // add temporary properties to first doc of each
            createDocs = createDocs.filter(a => a.length >= 1)
            createDocs.forEach(a => {
                // numeric date of creation of latest 'create' doc
                a[0].lastDate = a[a.length - 1].date
                // array of each text item for the page's 'create' docs, and its className (aka highlight style)
                a[0].texts = a.map(doc => {
                    return {
                        // text might be undefined if info.selectedText was undefined in context_menus.js (for some reason)
                        text: doc.text,
                        docId: doc._id,
                        date: doc.date,
                        className: doc.className,
                    }
                })
            })

            _docs = createDocs.map(a => a[0])

            // group the documents by their title (if possible), and get a sorted array
            updateGroupedDocuments()
            $scope.$apply()

            // After the initial update, watch for changes to options object
            $scope.$watchCollection('options', (newValue, oldValue) => {
                // update storage
                _storage.setValue(newValue.groupBy, "options_bookmarks_group_by").then(() =>
                    _storage.setValue(newValue.ascendingOrder, "options_bookmarks_ascending_order")
                ).then(() =>
                    _storage.setValue(newValue.showPageText, "options_bookmarks_show_page_text")
                ).then(() => {
                    // only these need to cause update
                    // if (newValue.groupBy === oldValue.groupBy &&
                    //     newValue.ascendingOrder === oldValue.ascendingOrder) {
                    //     return
                    // }

                    // rebuild group documents array based on new options
                    updateGroupedDocuments()

                    $scope.$apply()
                })
            })
        })
    }) // end

    /**
     * Group an array of documents by a common property
     * 
     * @param {[{Object}]} docs array of 'create' documents for the first of its matches 
     * @param {Object} [options] options object
     * @returns [{object}] array of groups
     */
    function groupDocuments(docs, options) {
        // grouped by property name (section title)
        var groups = {},
            untitledGroup = {
                // value: chrome.i18n.getMessage('untitled_page_group'),
                docs: []
            },
            numberGroup = { 
                value: "#",// chrome.i18n.getMessage('untitled_page_group'),
                docs: []
            }

        options = options || {}
        options.groupBy = options.groupBy || 'title'
        options.reverse = (typeof options.reverse === 'boolean' && options.reverse) || false

        docs.filter(d => d.texts.length > 0).forEach(doc => {
            // typeless value defining group
            const groupValue = (() => {
                switch (options.groupBy) {
                    case 'title':
                        const title = doc.title
                        return typeof title === 'string' && title.length >= 1 && title[0].toUpperCase() || undefined

                    case 'first_date':
                        // days since epoch
                        return Math.floor(new Date(doc.date).getTime() / 8.64e7)

                    case 'last_date':
                        // days since epoch
                        return Math.floor(new Date(doc.lastDate).getTime() / 8.64e7)

                    default:
                        console.assert(false)
                }
            })()

            const group = (() => {
                switch (typeof groupValue) {
                    case 'undefined':
                        return untitledGroup

                    case 'string':
                        // if the string (single letter) is a digit
                        if (options.groupBy === 'title' && !isNaN(parseInt(groupValue, 10))) {
                            return numberGroup
                        }
                        // fallthrough

                    default:
                        // if groups doesn't have a section with this title, add it
                        if (!groups.hasOwnProperty(groupValue)) {
                            groups[groupValue] = {
                                value: groupValue,      // formatted later (if not string)
                                docs: []
                            }
                        }

                        return groups[groupValue]
                }
            })()

            group.docs.push(doc)
        })

        // convert to array
        let sortedGroups = Object.getOwnPropertyNames(groups)
            .sort()
            .map(value => groups[value])

        Array.prototype.push.apply(sortedGroups, [
            numberGroup,
            untitledGroup
        ].filter(g => g.docs.length > 0))

        // if (numberGroup.docs.length > 0) {
        //     sortedGroups.push(numberGroup)
        // }

        // if (untitledGroup.docs.length > 0) {
        //     sortedGroups.push(untitledGroup)
        // }

        sortedGroups.forEach(group => {
            // currently groups only have a raw value - format it as text
            group.title = (() => {
                switch (typeof group.value) {
                    case 'undefined':
                        // untitled
                        return undefined
                    case 'string':
                        // value is the first letter of group title
                        return group.value
                    case 'number':
                        // value is days since epoch
                        const date = new Date(group.value * 8.64e7)

                        return date.toLocaleDateString(undefined, {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        })

                    default:
                        console.assert(false)
                        break;
                }
            })()

            // not needed
            delete group.value

            // sort documents in-place within group
            group.docs.sort((() => {
                // return a specific comparison func
                switch (options.groupBy) {
                    case 'title':
                        return (d1, d2) => {
                            // title may be undefined 
                            if (typeof d1 === 'undefined' && typeof d2 === 'undefined') {
                                return 0;
                            }

                            return (d1.title || "").localeCompare(d2.title || "")
                        }

                    case 'first_date':
                        return (d1, d2) => d1.date - d2.date
                    case 'last_date':
                        return (d1, d2) => d1.lastDate - d2.lastDate
                }
            })())
        })

        if (options.reverse) {
            sortedGroups.reverse()

            sortedGroups.forEach(group => {
                group.docs.reverse()
            })
        }
        // groups.sort((a, b) => b.title.localeCompare(a.title))

        return sortedGroups
        // $scope.apply()
    }

    function updateGroupedDocuments() {
        // group the documents by their title (if possible), and get a sorted array
        $scope.groupedDocs = groupDocuments(_docs, {
            groupBy: $scope.options.groupBy,
            reverse: !$scope.options.ascendingOrder,
        })
    }

    /**
     * Button on the text of each highlight was clicked
     * @param {Object} docId - id of doc that defines the actual highlight
     * @param {Object} initialDoc - initial doc for the page, containing array of text objects for all the highlights
     */
    $scope.onClickRemoveHighlight = (docId, initialDoc) => {
        // wait until transition on close button ends before updating model
        backgroundPage._eventPage.deleteHighlight(undefined, docId).then(() => {
            const index = initialDoc.texts.findIndex(t => t.docId === docId)
            console.assert(index !== -1)

            // splice out of array of highlights (i.e. texts)
            initialDoc.texts.splice(index, 1)

            // regroup
            updateGroupedDocuments()
            $scope.$apply()
        })
    }

    /**
     * Clicked 'remove all highlights for this site' button (x)
     */
    $scope.onClickRemoveAllHighlights = function (doc, group) {
        if (!window.confirm(chrome.i18n.getMessage("confirm_remove_all_highlights"))) {
            return Promise.resolve()
        }

        // var match = $scope.rows[index].key;

        return backgroundPage._database.removeDocuments_Promise(doc.match).then(result => {
            // remove the corresponding doc from our '$scope.groupedDocs' via the handy reference
            const index = group.docs.indexOf(doc)
            if (index === -1) {
                return Promise.reject(new Error("document not found"))
            }

            group.docs.splice(index, 1)
            $scope.$apply()
        })
    };

    /**
     * Clicked 'remove all pages' button.
     */
    $scope.onClickRemoveAllPages = function () {
        if (window.confirm(chrome.i18n.getMessage("confirm_remove_all_pages"))) {
            // destroy and re-create the database
            return backgroundPage._database.reset().then(function () {
                $scope.groupedDocs = [];
                $scope.$apply();
            });
        } else {
            return Promise.reject(new Error());
        }
    };
}]);

/**
 * Controller for Experimental pane
 */
optionsControllers.controller('ExperimentalController', ["$scope", function ($scope) {
    'use strict';
    var backgroundPage;

    const KEYNAMES = {
        magic: 'magic',
        version: 'version'
    };

    const VALUE_MAGIC = "Super Simple Highlighter Exported Database";

    function utf8_to_b64(str) {
        return window.btoa(unescape(encodeURIComponent(str)));
    }

    function b64_to_utf8(str) {
        return decodeURIComponent(escape(window.atob(str)));
    }


    function onFileSelect(evt) {
        var file = evt.target.files[0];	// FileList object
        var reader = new FileReader();

        // Closure to capture the file information.
        reader.onload = function (e) {
            // newline delimited json
            var dumpedString = e.target.result;

            load(dumpedString).then(function () {
                location.reload();
            }).catch(function (err) {
                // error loading or replicating tmp db to main db
                var text = "Status: " + err.status + "\nMessage: " + err.message;
                alert(text);
            });
        };

        // Read in the image file as a data URL.
        reader.readAsText(file, "utf-8");
        // reader.readAsDataURL(file);
    }

    /**
     * Init
     * @param {object} _backgroundPage
     */
    function onInit(_backgroundPage) {
        backgroundPage = _backgroundPage;

        // add event listener to files input element
        document.getElementById('files').addEventListener('change', onFileSelect, false);
    }

	/**
	 * dump database to text, copy to clipboard
	 */
    $scope.onClickDump = function () {
        // header
        var header = {};

        header[KEYNAMES.magic] = VALUE_MAGIC;
        header[KEYNAMES.version] = 1;

        var dumpedString = JSON.stringify(header);

        return _storage.highlightDefinitions.getAll_Promise({
            defaults: false
        }).then(function (items) {
            // the first item is always the highlights object
            dumpedString += '\n' + JSON.stringify(items) + '\n';

            // the remainder is the dumped database
            var stream = new window.memorystream();

            stream.on('data', function (chunk) {
                dumpedString += chunk.toString();
            });

            return backgroundPage._database.dump(stream);
        }).then(function () {
            // create a temporary anchor to navigate to data uri
            var a = document.createElement("a");

            a.download = chrome.i18n.getMessage("experimental_database_export_file_name");
            a.href = "data:text;base64," + utf8_to_b64(dumpedString);

            // a.href = "data:text/plain;charset=utf-8;," + encodeURIComponent(dumpedString);
            // a.href = "data:text;base64," + utf8_to_b64(dumpedString);
            // a.href = "data:text;base64," + utf8_to_b64(dumpedString);
            //window.btoa(dumpedString);

            // create & dispatch mouse event to hidden anchor
            var mEvent = document.createEvent("MouseEvent");
            mEvent.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);

            a.dispatchEvent(mEvent);
        });
    };

    function load(dumpedString) {
        var jsonObjects = dumpedString.split('\n');
        var highlightDefinitions;

        // newline delimited json
        return new Promise(function (resolve, reject) {
            // validate header
            var header = JSON.parse(jsonObjects.shift());

            if (header[KEYNAMES.magic] === VALUE_MAGIC || header[KEYNAMES.version] === 1) {
                resolve()
            } else {
                reject({
                    status: 403,
                    message: "Invalid File"
                });
            }
        }).then(function () {
            // the first line-delimited json object is the storage highlights object. Don't use them until the database loads successfully
            highlightDefinitions = JSON.parse(jsonObjects.shift());

            // remainder is the database
            return backgroundPage._database.load(jsonObjects.join('\n'));
        }).then(function () {
            // set associated styles. null items are removed (implying default should be used)
            return _storage.highlightDefinitions.setAll_Promise(highlightDefinitions);
        });
    }

    // starter
    chrome.runtime.getBackgroundPage(function (backgroundPage) {
        onInit(backgroundPage);
    });
}]);

/**
 * Controller for About pane
 */
optionsControllers.controller('AboutController', ["$scope", function ($scope) {
    'use strict';
    $scope.manifest = chrome.runtime.getManifest();
    //    $scope.changelog = _changelog;
    $scope.libraries = _libraries;
    $scope.cc = _licenses;

	/**
	 * Clicked 'restore all warnings' button. Clears the 'dismissed' property for all warning dialogs
	 * @type function
	 */
    $scope.onClickRestoreAllWarnings = function () {
        // TODO: remember to keep all property setters in sync with this method
        return _storage.setValue(false, "fileAccessRequiredWarningDismissed")
    };
}]);

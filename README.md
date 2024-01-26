# pd-naja

1. [Quick start](#quick-start)
2. [Utilities](#utilities)
3. [Extensions](#extensions)
   1. [AjaxModalExtension](#ajaxmodalextension)
   2. [AjaxModalPreventRedrawExtension](#ajaxmodalpreventredrawextension)
   3. [AjaxOnceExtension](#ajaxonceextension)
   4. [BtnSpinnerExtension](#btnspinnerextension)
   5. [ConfirmExtension](#confirmextension)
   6. [FollowUpRequestExtension](#followuprequestextension)
   7. [ForceRedirectExtension](#forceredirectextension)
   8. [ForceReplaceExtension](#forcereplaceextension)
   9. [SingleSubmitExtension](#singlesubmitextension)
   10. [SnippetFormPartExtension](#snippetformpartextension)
   11. [SpinnerExtension](#spinnerextension)
   12. [SuggestExtension](#suggestextensions)
   13. [ToggleClassExtension](#toggleclassextension)

## Quick start
```
$ npm install naja @peckadesign/pd-naja
```

```typescript
import naja from 'naja'
import { ExtensionName } from '@peckadesign/pd-naja'

naja.registerExtension(new ExtensionName())
```

```typescript
import naja from 'naja'
import { ControlManager } from '@peckadesign/pd-naja'
import SomeControl from '@/js/Controls/SomeControl' // `SomeControl` must implement `Control` interface
import SomeAnotherControl from '@/js/Controls/SomeAnotherControl'

// Create instance of ControlManager
const controlManager = new ControlManager(naja)

// This control is only initialized on page load
controlManager.addControlOnLoad(SomeControl)

// This control will also get initialized after Naja requests
controlManager.addControlOnLive(SomeAnotherControl)

```

## Utilities
This package provides easy ways to add JS components reactive to Naja ajax events.

`Control` is meant to be used for standalone components, that might be dependent on ajax. It should be used together with `ControlManager`. Class implementing the `Control` interface **should export its instance**. Then the intended lifecycle of class is as follows:

1. `constructor` is called immediately and is also called only once. This is the ideal place for e.g. adding common event handlers to the `body`, or modifying necessary DOM properties on elements not affected by ajax.

2. The instantiated class is then added to ControlManager either by `addControlOnLoad` or `addControlOnLive`. This ensures, that on `DOMContentLoaded` the `initialize` function of class is called. This method should implement initialization of the control dependent on fully loaded DOM. The `context` argument is equal to `document` in this call.

3. In the case of using `addControlOnLive`, two methods are called after each successful Ajax request:
   1. **Optional:** Just before the snippet update, the optional `destroy` method is called. It will only be called if the [snippet update operation](https://naja.js.org/#/snippets?id=snippet-update-operation) is `replace`.

   2. The `initialize` method is called for each snippet. It is called immediately after the snippet has been updated. The `context` argument is equal to the modified nette snippet.


## Extensions

### `AjaxModalExtension`
This extension allows you to implement modal window with browser history using Naja. Extension itself is agnostic of used modal, you can use any modal plugin you want as long as you provide simple adapter implementing `AjaxModal` interface. Class implementing `AjaxModal` is only parameter recieved by constructor.

```typescript
import naja from 'naja'
import { AjaxModalExtension } from '@peckadesign/pd-naja'
import { modal } from '@/js/App/PdModal' // modal must implement AjaxModal interface 

naja.registerExtension(
	new AjaxModalExtension(modal)
)
```

#### Interface `AjaxModal`
| Property                                                                                                                                      | Description                                                                                                                                                                                                                                                                                                                                            |
|-----------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `element: Element`                                                                                                                            | Most outer element of the modal window.                                                                                                                                                                                                                                                                                                                |
| `reservedSnippetIds: string[]`                                                                                                                | List of snippet id's, that are neccessary for modal to work, e.g. `snippet--modal`.                                                                                                                                                                                                                                                                    |
| `show(opener: Element \| undefined, options: any, event: BeforeEvent \| PopStateEvent): void`                                                 | Method that is called for opening the modal. `opener` is the element causing the opening, event is the associated event.                                                                                                                                                                                                                               |
| `hide(event: SuccessEvent \| PopStateEvent): void`                                                                                            | Method that is called for closing the modal either as a result of `closeModal` property in ajax response or as a result of navigating using browser history.                                                                                                                                                                                           |                                            
| `isShown(): boolean`                                                                                                                          | Should return wheter the modal is opened or not.                                                                                                                                                                                                                                                                                                       |
| `onShow: (callback: EventListener) => void`<br/>`onHide: (callback: EventListener) => void`<br/>`onHidden: (callback: EventListener) => void` | The extension needs to attach some handlers when show, hide or hidden happens. These functions should provide a way to add listeners to such events.                                                                                                                                                                                                   |
| `dispatchLoad?: (options: any, event: SuccessEvent \| PopStateEvent) => void`                                                                 | If you provide this method, extension will call it whenever the content is changed (loaded).                                                                                                                                                                                                                                                           |
| `getOptions(opener: Element): any`                                                                                                            | If you need to change some modal settings based on opener element, you can do that in this function. Return value of this function is stored in `localStorage` (or wherever is Naja configured to store states) and also in `HistoryState`. Bear in mind that this introduces some limitations of what can be returned (e.g. no `Element` is allowed). | 
| `setOptions(options: any): void`                                                                                                              | Counterpart of `getOptions` method, you can use this method to restore modal settings based on `options`.                                                                                                                                                                                                                                              |

### `AjaxModalPreventRedrawExtension`
Occasionally we may have an ajax request invoked inside the modal window, but this request is not related to the modal window itself. However, because it is invoked from within the modal window, the HTTP header `Pd-Modal-Opened` is set. If enabled, this extension adds another header to the request, namely `Pd-Modal-Prevent-Redraw`. The extension can be enabled by adding the `data-naja-modal-prevent-redraw` data attribute to the interacted element, or by adding `pdModalPreventRedraw` to options.


### `AjaxOnceExtension`
This extension allows you to specify for a given element that the request will only be made on the first interaction. For example, for collapsible boxes, it is possible to make the request only once, when they are expanded for the first time. It is enabled by setting `data-naja-once` on the interacted element and allows the same element to control the collapsible box and make a request at the same time, without creating multiple unnecessary requests.

### `BtnSpinnerExtension`
Extension that allows you to add a spinner element to a certain button. In some cases, the overlay spinner for an area might not be neccessary and overlaying only the button might be sufficient. To use this extension, you have to add a data atributte data-naja-btn-spinner to the button element or data-naja-spinner="btn". In the latter case, the [SpinnerExtension](#spinnerextension) is also disabled automatically.

When loaded, the extension also automatically adds button spinners to all non-ajax forms. This can be disabled on a per-button basis by setting `data-no-spinner` or `data-no-btn-spinner` on the button element.

The extension constructor receives 3 parameters:

| Parameter                                                                | Description                                                                                                                                                             |
|--------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `spinner: ((props?: any) => Element) \| Element`                         | Mandatory parameter. It should either be function return the spinner element, or directly element.                                                                      |
| `getSpinnerProps: ((initator: Element) => any) \| undefined = undefined` | If you provide `spinner` as a function, you might also provide function to get settings from ajax initiator. Returned value is passed as a `props` to `spinner()` call. |
| `timeout: number = 60000`                                                | Timeout in milliseconds after which the spinner is removed for non-ajax forms. Ajax forms will use the Naja / Request API timeout (if there is one).                    |


### `ConfirmExtension`
Simple extension that uses `window.confirm` before making the request, allowing the user to prevent the request from being made. It is enabled by setting the data attribute `data-confirm`. The value of the attribute is used as a parameter for the `window.confirm` call.

### `FollowUpRequestExtension`
This extension allows you to chain multiple requests. This is useful, for example, within modals, where after redrawing the modal, you may need to redraw the page below it as well. This page may be from a different presenter, so you need to redraw with a different request. When used, this extension checks for the presence of `followUpUrl` in the payload. This is the URL to which the follow up request will be made.

### `ForceRedirectExtension`
This extension allows you to force redirect the page to a specific URL. When imported, it checks for the presence of `forceRedirect` in the payload and then redirects to it. 

### `ForceReplaceExtension`
If you are using content prepending or appending on snippets, you may need to force replace their content when certain elements have been interacted with. For example, if you have an infinite pager with new items appended, you may need to clear the snippet when some sort of filtering request has been made. This extension changes the snippet operation to `replace` when enabled by using the `data-naja-snippet-force-replace attribute` on the interacted element. See [Snippet update operation](https://naja.js.org/#/snippets?id=snippet-update-operation) in the Naja docs for more information about update operations.

### `ScrollToExtension`
Extension that gives you the ability to scroll with the page when the ajax request starts (or finishes). This extension takes a `defaultScrollToEvent: 'before' | 'success'` parameter in the constructor. This parameter defines on which event the scrolling will occur by default. The element to scroll to is defined using a `data-naja-scroll-to` attribute containing selector. You can also change the default value of event per request using `data-naja-scroll-to-event`. It uses the `element.scrollIntoView()` method in the background. There is currently no way to pass arguments to the call.

### `SingleSubmitExtension`
Most of the time it is desirable to allow only single form submissions and prevent duplicate submissions, e.g. by double-clicking a button. This extension disables all buttons within a form on submission. It also works for non-ajax forms where there is a timeout after which the buttons are re-enabled. This extension is enabled by default for all forms, but can be disabled by setting a data attribute `data-naja-single-submit="off"`.

There are 2 parameters passed to the constructor:

| Parameter                      | Description                                                                                                                                                             |
|--------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `buttonDisabledClass?: string` | Class name added to the buttons disabled by this extension. Defaults to null.                                                                                           |
| `timeout: number = 60000`      | Timeout in milliseconds after which the spinner is removed for non-ajax forms. Ajax forms will use the Naja / Request API timeout (if there is one). |

### `SnippetFormPartExtension`
By default, Naja and netteForms and pdForms expect the snippets to be outer wrappers of the form elements. Because of this, if the snippet is inside the form, the validations and nette toggles may not work properly. This extension simply calls the `Nette.initForm()` method for each form that contains a redrawn snippet. The method itself doesn't attach any handlers if the form has the `formnovalidate` attribute (which it sets itself on initialisation), but the toggles are initialised beforehand.

### `SpinnerExtension`

This extension allows you to add configurable loading indicator to ajax request. Constructor recieves following 4 parameters:

| Parameter                                                                | Description                                                                                                                                                             |
|--------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `spinner: ((props?: any) => Element) \| Element`                         | Mandatory parameter. It should either be function return the spinner element, or directly element.                                                                      |
| `getSpinnerProps: ((initator: Element) => any) \| undefined = undefined` | If you provide `spinner` as a function, you might also provide function to get settings from ajax initiator. Returned value is passed as a `props` to `spinner()` call. |
| `ajaxSpinnerWrapSelector = '.ajax-wrap'`  | See below.                                                                                                                                                              |
|`ajaxSpinnerPlaceholderSelector = '.ajax-spinner'`| See below                                                                                                                                                               |

The logic for spinner placeholder is as follows:
1. The extension can be disabled by using `data-naja-spinner="off"`.
3. The extension is also disabled if `data-naja-spinner="btn"` is set. In this case the spinner rendering is up to [`BtnSpinnerExtension`](#btnspinnerextension), which will be enabled automatically.
2. If there is `data-naja-spinner` with different value, this value is used as a selector for element into which the spinner element is appended.
3. If there is no `data-naja-spinner`, closest `ajaxSpinnerWrapSelector` is being searched for and:
   1. If there is `ajaxSpinnerPlaceholderSelector` inside, this element is used for placing spinner element.
   2. If not, the spinner element is appended into `ajaxSpinnerWrapSelector` itself.


### `SuggestExtensions`
This extension allows you to implement a suggestion box. It uses a form element with a dedicated suggestion button to submit the form using ajax. The result of the request is expected to be the redrawing of the snippet with results. See below for a detailed description of the elements. The extension constructor takes optional spinner and getSpinnerProps parameters of the same type as described in the [`SpinnerExtensions`](#spinnerextension) and [`BtnSpinnerExtension`](#btnspinnerextension).

At a minimum, these HTML elements are expected for the extension to work:

| Selector             | Element type                             | Description                                                                                                                                                                                                                       |
|----------------------|------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `.js-suggest`          | `HTMLFormElement`                        | The form element for the suggest extension.                                                                                                                                                                                       |
| `.js-suggest__input`   | `HTMLInputElement`                       | Input element whose value is used as a query parameter in a suggestion request.                                                                                                                                                   |
| `.js-suggest__btn`     | `HTMLButtonElement \| HTMLInputElement` | Button used for form submission to suggestion request.                                                                                                                                                                            |
| `.js-suggest__suggest` | `HTMLElement`                              | The snippet element where the results are displayed. If there are no children elements, the extension adds a class `js-suggest__suggest--empty`. If the element should be shown, the class `js-suggest__suggest--shown` is added. |
| `.js-suggest__link`    | `HTMLAnchorElement`                        | Elements with this class are accessible using the keyboard arrows. Every result should have this class. When the anchor element is activated by keyboard interaction, it receives the class `js-suggest__link--active`.           |

### `ToggleClassExtension`

With this extension you can change the classes on the interacted element immediately at the start of the request. You can use it for example to mark the active element before the ajax finishes. If the request fails with an error (including user interruption), the classes will be reset to the previous state. You can specify the classes to toggle using the data attribute `data-naja-toggle-class`. This attribute expects a JSON object where keys are selectors (used as parameter for the `querySelectorAll` called on the interacted element) and values are class names to be changed. The extension uses the [`toggle()`](https://developer.mozilla.org/en-US/docs/Web/API/DOMTokenList/toggle) function, so it can also remove classes from the element. If you need to change the classes on the interacted element itself, you can use selector `:scope > *`. For example:
```html
<a … data-naja-toggle-class='{
       ":scope > *": "active",
       "img": "shadow rounded-full"
   }'>
	<img … class="shadow">
	…
</a>
```

This configuration would add the `active` class to the anchor element and the `rounded-full` class to the image. It would also remove the `shadow` class from the image as it was already present.

export type SpinnerType = ((props?: any) => Element) | Element
export type SpinnerPropsFn = ((initiator: Element) => any) | undefined

export interface WithSpinner {
	spinner: SpinnerType
	getSpinnerProps: SpinnerPropsFn
}

// `Control` is meant to be used for standalone components, that might be dependent on ajax. It should be used together
// with ControlManager. Class implementing the `Control` interface should export its instance. Then the intended
// lifecycle of class is as follows:
//
// 1. `constructor` is called immediately and is also called only once. This is the ideal place for e.g. adding common
//    event handlers to the `body`, or modifying necessary DOM properties on elements not affected by ajax.
//
// 2. The instantiated class is then added to ControlManager either by `addControlOnLoad` or `addControlOnLive`. This
//    ensures, that on `DOMContentLoaded` the `initialize` function of class is called. This method should implement
//    initialization of the control dependent on fully loaded DOM. The `context` argument is equal to `document` in this
//    call.
//
// 3. In the case of using `addControlOnLive`, two methods are called after each successful Ajax request:
//
//    1. Optional: Just before the snippet update, the optional `destroy` method is called. It will only be called
//       if the [snippet update operation](https://naja.js.org/#/snippets?id=snippet-update-operation) is `replace`.
//
//    2. The `initialize` method is called for each snippet. It is called immediately after the snippet has been
//       updated. The `context` argument is equal to the modified nette snippet.
export interface Control {
	initialize(context: Element | Document): void

	destroy?(context: Element): void
}

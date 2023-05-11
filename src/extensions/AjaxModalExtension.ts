import { Naja, BeforeEvent, CompleteEvent, StartEvent, SuccessEvent, Options, Extension } from 'naja/dist/Naja'
import { BuildStateEvent, HistoryState } from 'naja/dist/core/HistoryHandler'
import { InteractionEvent } from 'naja/dist/core/UIHandler'
import { FetchEvent } from 'naja/dist/core/SnippetCache'

declare module 'naja/dist/Naja' {
	interface Options {
		pdModal?: boolean
		modalOpener?: Element
		modalOptions?: any
	}

	interface Payload {
		closeModal?: boolean
	}
}

type CallbackFn = (callback: EventListener) => void

export interface AjaxModal {
	// main element of the modal
	element: Element

	// id's of snippets, that are necessary for modal function
	reservedSnippetIds: string[]

	show(opener: Element | undefined, options: any, event: BeforeEvent | PopStateEvent): void
	hide(event: SuccessEvent | PopStateEvent): void
	isShown(): boolean

	onShow: CallbackFn
	onHide: CallbackFn
	onHidden: CallbackFn

	dispatchLoad?: (options: any, event: SuccessEvent | PopStateEvent) => void

	getOptions(opener: Element): any
	setOptions(options: any): void
}

interface HistoryStateWrapper extends Record<string, any> {
	location: string
	state: HistoryState
	title: string
}

type HistoryDirection = 'forwards' | 'backwards'

export class AjaxModalExtension implements Extension {
	private readonly modal: AjaxModal
	private readonly uniqueExtKey: string = 'modal'

	private popstateFlag = false
	private hidePopstateFlag = false

	private historyEnabled = false // (dis)allows `pushState` after hiding the modal when going back in history (popstate), we don't want to push new state into history same is true also when the history is disabled for request altogether
	private historyDirection: HistoryDirection = 'backwards'

	private modalOptions: any = {}

	private original: HistoryStateWrapper[] = [] // stack of states under the modal after hiding the modal with `forwards` history mode, we need to push the previous state
	private lastState: HistoryStateWrapper | null = null
	private initialState: HistoryState | Record<string, never>

	private readonly abortControllers: Map<string, AbortController> = new Map()

	public constructor(modal: AjaxModal) {
		// Extension popstate has to be executed before naja popstate, so we can correctly detect if the pdModal is
		// opened. Therefore, we bind the callback before the extension initialization itself.
		window.addEventListener('popstate', this.popstateHandler.bind(this))

		this.modal = modal
		this.initialState = history.state || {}
	}

	public initialize(naja: Naja): void {
		naja.uiHandler.addEventListener('interaction', this.checkExtensionEnabled.bind(this))

		naja.historyHandler.addEventListener('buildState', this.buildState.bind(this))

		naja.snippetCache.addEventListener('fetch', this.onSnippetFetch.bind(this))

		naja.addEventListener('before', this.before.bind(this))
		naja.addEventListener('start', this.abortPreviousRequest.bind(this))
		naja.addEventListener('success', this.success.bind(this))
		naja.addEventListener('complete', this.clearRequest.bind(this))

		this.modal.onShow(this.showHandler.bind(this))
		this.modal.onHide(() => {
			this.removeModalSnippetsIds()
			this.abortControllers.get('modal')?.abort()
		})
		this.modal.onHidden(this.hiddenHandler.bind(this))
	}

	private isRequestWithHistory = (options: Options): boolean => {
		return options.history !== false
	}

	private isPdModalState = (state: HistoryState | Record<string, never>): boolean => {
		return 'pdModal' in state && state.pdModal?.isShown
	}

	private restoreExtensionPropertiesFromState = (state: HistoryState): void => {
		this.historyEnabled = true // Called from popstateHandler means the history is enabled
		this.historyDirection = state.pdModal.historyDirection
		this.modalOptions = state.pdModal.options
	}

	private checkExtensionEnabled(event: InteractionEvent): void {
		const { element, options } = event.detail

		options.pdModal =
			this.modal.isShown() ||
			element.hasAttribute('data-naja-modal') ||
			(element as HTMLInputElement).form?.hasAttribute('data-naja-modal')

		// If the extension is enabled and modal is not opened, we detect and store history mode. History mode cannot
		// change when traversing ajax link inside modal.
		if (!options.pdModal) {
			return
		}

		// `modalOptions` will be stored in state, therefore no `Element` is allowed. These options are also forwarded
		// to other Naja event handlers via `options`. We also store the element separately to be used there as well.
		this.modalOptions = this.modal.getOptions(element)

		options.modalOptions = this.modalOptions
		options.modalOpener = element

		// History direction can only be set before opening the modal, then it stays the same until modal is hidden.
		if (!this.modal.isShown()) {
			this.historyDirection = element.getAttribute('data-naja-modal-history') === 'forwards' ? 'forwards' : 'backwards'
		}
	}

	private onSnippetFetch(event: FetchEvent): void {
		event.detail.options.pdModal = 'pdModal' in event.detail.state
	}

	private removeModalSnippetsIds(): void {
		// When closing the modal, we don't want to update any snippets inside it, when other requests finishes. This
		// will ensure, that snippets that might be also outside modal (e.g. flash messages) will be redrawn outside the
		// modal. Therefore, we remove the id attributes, so no snippet is found.
		//
		// Some snippets are necessary for modal function
		this.modal.element.querySelectorAll('[id^="snippet-"]').forEach((snippet) => {
			if (!this.modal.reservedSnippetIds.includes(snippet.id)) {
				snippet.removeAttribute('id')
			}
		})
	}

	private abortPreviousRequest(event: StartEvent): void {
		const { abortController, options } = event.detail
		if (options.pdModal) {
			this.abortControllers.get(this.uniqueExtKey)?.abort()
			this.abortControllers.set(this.uniqueExtKey, abortController)
		}
	}

	private clearRequest(event: CompleteEvent): void {
		const { request } = event.detail
		if (!request.signal.aborted) {
			this.abortControllers.delete(this.uniqueExtKey)
		}
	}

	private buildState(event: BuildStateEvent): void {
		const { options, state } = event.detail

		// Every time naja builds the state, we extend it with `pdModal` object containing information about modal being
		// opened and what history mode is in use. When options.forceRedirect is set, modal might be open but the new
		// state will be redirected outside it.
		const isShown: boolean = this.modal.isShown() && !options.forceRedirect
		state.pdModal = {
			isShown,
			historyDirection: isShown ? this.historyDirection : null,
			options: isShown ? this.modalOptions : null
		}

		// If the state is build, the history is enabled. This information is needed inside modal callback where the
		// options are not available, so we store this internally in extension.
		this.historyEnabled = true
	}

	private before(event: BeforeEvent) {
		const { options, request } = event.detail
		if (!options.pdModal) {
			return
		}

		this.modal.show(options.modalOpener, options.modalOptions, event)

		request.headers.append('Pd-Modal-Opened', String(Number(this.modal.isShown())))
	}

	private success(event: SuccessEvent) {
		const { options, payload } = event.detail

		this.popstateFlag = false
		this.lastState = {
			location: location.href,
			state: history.state,
			title: document.title
		}

		if (!options.pdModal) {
			return
		}

		const requestHistory = this.isRequestWithHistory(options)

		// If the history is disabled for current request, we will disable it for all ajax links / forms in modal as well.
		if (!requestHistory && event.target) {
			const ajaxified = this.modal.element.querySelectorAll<HTMLElement>((event.target as Naja).uiHandler?.selector)

			ajaxified.forEach((element: HTMLElement) => {
				element.setAttribute('data-naja-history', 'off')
			})
		}

		if (payload.closeModal) {
			this.modal.hide(event)
		} else {
			this.modal.setOptions(this.modalOptions)

			if (this.modal.dispatchLoad) {
				this.modal.dispatchLoad(this.modalOptions, event)
			}
		}
	}

	private showHandler() {
		this.modal.setOptions(this.modalOptions)

		// If the modal history mode is `forwards`, we store the state under the modal, so we can push it as a new state
		// after hiding the modal.
		if (this.historyDirection === 'forwards') {
			if (this.popstateFlag && this.lastState) {
				this.original.push(this.lastState)
			} else {
				const state: HistoryStateWrapper = {
					location: location.href,
					state: history.state,
					title: document.title
				}
				this.original.push(state)
			}
		}
	}

	private hiddenHandler() {
		// This method is called after modal has been hidden. It either pushes a new state into history (mode `forwards`)
		// or calls `history.back()` to start go-back procedure.
		//
		// New state is pushed only if we are able to retrieve the state under the modal (which should have been stored
		// previously) and the modal is not being closed using forward / back buttons in browser.
		if (!this.historyEnabled) {
			return
		}

		if (this.historyDirection === 'backwards') {
			// We don't know how many states we need to return. We go one by one, see popstate handler. This go-back
			// procedure is detected using `hidePopstateFlag`.
			this.hidePopstateFlag = true
			this.cleanData()
			window.history.back()
		} else if (this.historyDirection === 'forwards') {
			const state = this.original.pop()
			this.original = []

			if (state) {
				// When closing the modal using forward / back buttons in browser, the current state is the same as the
				// one stored in `this.original`. If that's the case, we don't push anything as it would duplicate the
				// state in history.
				if (history.state === undefined || history.state.href !== state.location) {
					history.pushState(state.state, state.title, state.location)
					document.title = state.title

					this.popstateFlag = false
					this.lastState = {
						location: state.location,
						state: state.state,
						title: state.title
					}
				}
			}

			this.cleanData()
		}
	}

	private popstateHandler(event: PopStateEvent): void {
		const state: HistoryState = event.state || this.initialState

		if (typeof state === 'undefined' || !this.modal) {
			return
		}

		const isCurrentStatePdModal = this.isPdModalState(state)
		this.popstateFlag = true

		// We don't know how many states we go back. So we go one by one until the new state is not modal state
		// (`isPdModalState` is `false`).
		if (this.hidePopstateFlag) {
			// We don't want the naja popstate callback to be executed (or any other popstate handler).
			event.stopImmediatePropagation()

			if (isCurrentStatePdModal) {
				window.history.back()

				return
			} else {
				// Todo check if this is really necessary. When used with nette.ajax / history.nette.ajax, this was necessary in some cases, where the title hasn't been restored correctly.
				if (state.title) {
					document.title = state.title
				}
			}

			this.hidePopstateFlag = false
		}

		// We check if the state has pdModal object present on popstate. If so (and the pdModal.isShown is true), we proceed
		// to open the modal. Content of the modal is restored by naja itself (either from cache or by new request).
		//
		// If the initial state is also detected as pdModal state, we returned to some pdModal state using reload. In that
		// case, we don't want to open the modal, because we might be missing some snippets. Effectively this means that the
		// modal will never be opened by forward / back button if there has been some other site loaded outside the modal
		// (e.g. some non-ajax link leading from modal).
		if (isCurrentStatePdModal && !this.isPdModalState(this.initialState)) {
			this.restoreExtensionPropertiesFromState(state)

			this.modal.show(undefined, state.pdModal.options, event)

			// If there is some snippet cache, we might restore modal options. If not, options will be restored based on
			// options after the ajax request. Same applies to dispatching load event - if cache is on, we dispatch the
			// event immediately, otherwise it will be dispatched after ajax request.
			if (state.snippets?.storage !== 'off') {
				this.modal.setOptions(state.pdModal.options)

				if (this.modal.dispatchLoad) {
					this.modal.dispatchLoad(this.modalOptions, event)
				}
			}
		} else {
			this.historyEnabled = false // Hiding modal using forward / back button, we disable the history to prevent state duplication

			// Reload the page if the initial state has been inside modal. This prevents snippets loss e.g. during layout changes.
			if (this.isPdModalState(this.initialState)) {
				window.location.reload()
			}

			// Non-modal state and non-modal initial state, we just hide the current modal.
			this.modal.hide(event)

			// We don't want the naja popstate callback to be executed (or any other popstate handler).
			event.stopImmediatePropagation()
		}

		// Keep track of current state. When `backwards` history mode is used, we eventually push this state into
		// `this.original`.
		this.lastState = {
			location: location.href,
			state: state,
			title: document.title
		}
	}

	private cleanData(): void {
		this.historyEnabled = false
		this.historyDirection = 'backwards'
		this.modalOptions = null
	}
}

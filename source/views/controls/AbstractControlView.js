import { Class } from '../../core/Core';
import '../../foundation/ComputedProps';  // For Function#property
import '../../foundation/EventTarget';  // For Function#on
import '../../foundation/ObservableProps';  // For Function#observes
import View from '../View';
import ViewEventsController from '../ViewEventsController';
import { loc } from '../../localisation/LocaleController';
import formatKeyForPlatform from '../../application/formatKeyForPlatform';
import { DEFAULT_IN_INPUT } from '../../application/keyboardShortcuts.js';
import { isIOS } from '../../ua/UA';
import { appendChildren, create as el } from '../../dom/Element';

/**
    Class: O.AbstractControlView

    Extends: O.View

    The superclass for most DOM-control view classes. This is an abstract class
    and should not be instantiated directly; it is only intended to be
    subclassed.
*/
const AbstractControlView = Class({

    Extends: View,

    /**
        Property: O.AbstractControlView#isDisabled
        Type: Boolean
        Default: false

        Is the control disabled?
    */
    isDisabled: false,

    /**
        Property: O.AbstractControlView#isFocused
        Type: Boolean

        Represents whether the control currently has focus or not.
    */
    isFocused: false,

    /**
        Property (private): O.AbstractControlView#isFocusedVisible
        Type: Boolean

        Represents whether or the control currently has focus due to an action
        NOT taken by a click.
    */
    isFocusedVisible: false,

    /**
        Property: O.AbstractControlView#label
        Type: String|Element|null
        Default: ''

        A label for the control, to be displayed next to it.
    */
    label: '',

    /**
        Property: O.AbstractControlView#name
        Type: String|undefined
        Default: undefined

        If set, this will be the name attribute of the control.
    */
    name: undefined,

    /**
        Property: O.AbstractControlView#value
        Type: *
        Default: false

        The value represented by this control, for example true/false if a
        checkbox is checked/unchecked, or the text input into a textarea.
    */
    value: false,

    /**
        Property: O.AbstractControlView#tabIndex
        Type: Number|undefined
        Default: undefined

        If set, this will become the tab index for the control.
    */
    tabIndex: undefined,

    /**
        Property: O.AbstractControlView#shortcut
        Type: String
        Default: ''

        If set, this will be registered as the keyboard shortcut to activate the
        control when it is in the document.
    */
    shortcut: '',

    /**
        Property: O.AbstractControlView#shortcutWhenInputFocused
        Type: Enum
        Default: GlobalKeyboardShortcuts.DEFAULT_IN_INPUT

        If a shortcut is set, should it be active when an input is focused?
    */
    shortcutWhenInputFocused: DEFAULT_IN_INPUT,

    /**
        Property: O.AbstractControlView#tooltip
        Type: String
        Default: '' or 'Shortcut: <shortcut>'

        A tooltip to show when the mouse hovers over the view. Defaults to
        informing the user of the keyboard shortcut for the control, if set.
    */
    tooltip: function () {
        const shortcut = this.get( 'shortcut' );
        return shortcut ?
            loc( 'Shortcut: [_1]',
                shortcut
                    .split( ' ' )
                    .map( formatKeyForPlatform )
                    .join( ' ' + loc( 'or' ) + ' ' )
            ) : '';
    }.property( 'shortcut' ),

    /**
        Method: O.AbstractControlView#didEnterDocument

        Overridden to add keyboard shortcuts.
        See <O.View#didEnterDocument>.
    */
    didEnterDocument () {
        AbstractControlView.parent.didEnterDocument.call( this );
        const shortcut = this.get( 'shortcut' );
        if ( shortcut ) {
            shortcut.split( ' ' ).forEach( key => {
                ViewEventsController.kbShortcuts.register(
                    key,
                    this,
                    'activate',
                    this.get( 'shortcutWhenInputFocused' )
                );
            });
        }
        return this;
    },

    /**
        Method: O.AbstractControlView#didEnterDocument

        Overridden to remove keyboard shortcuts.
        See <O.View#didEnterDocument>.
    */
    willLeaveDocument () {
        const shortcut = this.get( 'shortcut' );
        if ( shortcut ) {
            shortcut.split( ' ' ).forEach( key => {
                ViewEventsController.kbShortcuts
                    .deregister( key, this, 'activate' );
            });
        }
        // iOS is very buggy if you remove a focused control from the doc;
        // the picker/keyboard stays up and cannot be dismissed
        if ( isIOS && this.get( 'isFocused' ) ) {
            this.blur();
        }
        return AbstractControlView.parent.willLeaveDocument.call( this );
    },

    /**
        Property: O.AbstractControlView#layerTag
        Type: String
        Default: 'label'

        Overrides default in <O.View#layerTag>.
    */
    layerTag: 'label',

    /**
        Property (private): O.AbstractControlView#_domControl
        Type: Element|null

        A reference to the DOM control managed by the view.
    */
    _domControl: null,

    /**
        Property (private): O.AbstractControlView#_domLabel
        Type: Element|null

        A reference to the DOM element containing the label for the view.
    */
    _domLabel: null,

    /**
        Method: O.AbstractControlView#draw

        Overridden to set properties and add label. See <O.View#draw>.
    */
    draw ( layer ) {
        const control = this._domControl;
        const name = this.get( 'name' );
        const tabIndex = this.get( 'tabIndex' );

        if ( !control.id ) {
            control.id = this.get( 'id' ) + '-input';
        }
        control.disabled = this.get( 'isDisabled' );

        if ( name !== undefined ) {
            control.name = name;
        }

        if ( tabIndex !== undefined ) {
            control.tabIndex = tabIndex;
        }

        layer.title = this.get( 'tooltip' );
        return this._domLabel = el( 'span.label', [ this.get( 'label' ) ] );
    },

    // --- Keep render in sync with state ---

    abstractControlNeedsRedraw: function ( self, property, oldValue ) {
        return this.propertyNeedsRedraw( self, property, oldValue );
    }.observes( 'isDisabled', 'label', 'name', 'tooltip', 'tabIndex' ),

    /**
        Method: O.AbstractControlView#redrawIsDisabled

        Updates the disabled attribute on the DOM control to match the
        isDisabled property of the view.
    */
    redrawIsDisabled () {
        this._domControl.disabled = this.get( 'isDisabled' );
    },

    /**
        Method: O.AbstractControlView#redrawLabel

        Updates the DOM label to match the label property of the view.
    */
    redrawLabel () {
        const label = this._domLabel;
        let child;
        while ( child = label.firstChild ) {
            label.removeChild( child );
        }
        appendChildren( label, [
            this.get( 'label' ),
        ]);
    },

    /**
        Method: O.AbstractControlView#redrawName

        Updates the name attribute on the DOM control to match the name
        property of the view.
    */
    redrawName () {
        this._domControl.name = this.get( 'name' );
    },

    /**
        Method: O.AbstractControlView#redrawTooltip

        Parameters:
            layer - {Element} The DOM layer for the view.

        Updates the title attribute on the DOM layer to match the tooltip
        property of the view.
    */
    redrawTooltip ( layer ) {
        layer.title = this.get( 'tooltip' );
    },

    /**
        Method: O.AbstractControlView#redrawTabIndex

        Updates the tabIndex attribute on the DOM control to match the tabIndex
        property of the view.
    */
    redrawTabIndex () {
        this._domControl.tabIndex = this.get( 'tabIndex' );
    },

    // --- Focus ---

    /**
        Method: O.AbstractControlView#focus

        Focusses the control.

        Returns:
            {O.AbstractControlView} Returns self.
    */
    focus () {
        if ( this.get( 'isInDocument' ) ) {
            this._domControl.focus();
            // Fire event synchronously.
            if ( !this.get( 'isFocused' ) ) {
                this.fire( 'focus' );
            }
        }
        return this;
    },

    /**
        Method: O.AbstractControlView#blur

        Removes focus from the control.

        Returns:
            {O.AbstractControlView} Returns self.
    */
    blur () {
        if ( this.get( 'isInDocument' ) ) {
            this._domControl.blur();
            // Fire event synchronously.
            if ( this.get( 'isFocused' ) ) {
                this.fire( 'blur' );
            }
        }
        return this;
    },

    /**
        Property: O.AbstractControlView#useParentFocus
        Type: Boolean

        Set if the element needs focus styling when the parent is selected (see
        FileButtonView).
    */
   useParentFocus: false,

    /**
        Method (private): O.AbstractControlView#_updateIsFocused

        Updates the <#isFocused> property.

        Parameters:
            event - {Event} The focus event.
    */
    _updateIsFocused: function ( event ) {
        this.set(
            'isFocused',
            event.type === 'focus' && ( event.target === this._domControl ||
                    this.get( 'useParentFocus' ) )
        );
        if ( event.type !== 'focus' && ( event.target === this._domControl ||
                this.get( 'useParentFocus' ) ) ) {
            this.set( 'isFocusedVisible', false );
        }
        this._updateIsFocusedVisible();
    }.on( 'focus', 'blur' ),

    /**
        Method (private): O.AbstractControlView#_updateIsFocusedVisible

        Updates the <#isFocusedVisible> property if focus is given to an element
        as the result of an action NOT taken by a click.
    */
    _updateIsFocusedVisible: function () {
        if ( this.get( 'isFocused' ) && !this.get( '_isClickNavigation' ) ) {
            this.set( 'isFocusedVisible', true );
        }
        this.set( '_isClickNavigation', false );
    }.queue( 'after' ),

    /**
        Property (private): O.AbstractControlView#_isClickNavigation
        Type: Boolean

        Helper to determine the cause of a focus action.
    */
    _isClickNavigation: false,

    /**
        Method (private): O.AbstractControlView#_addClickToFocusEventChain

        Updates the <#_isClickNavigation> property.  Uses mousedown due to event
        timing.  We add the _isClickNavigation property regardless of whether
        or not the element already has focus to keep the element's focus style
        consistent as the user interacts with it.
    */
    _addClickToFocusEventChain: function (/* event */) {
        this.set( '_isClickNavigation', true );
    }.on( 'mousedown' ),

    // --- Activate ---

    /**
        Method: O.AbstractControlView#activate

        An abstract method to be overridden by subclasses. This is the action
        performed when the control is activated, either by being clicked on or
        via a keyboard shortcut.
    */
    activate () {},

});

export default AbstractControlView;

/*global document */

import { Class } from '../../core/Core';
import '../../foundation/ComputedProps';  // For Function#property, #nocache
import '../../foundation/EventTarget';  // For Function#on
import '../../foundation/ObservableProps';  // For Function#observes
import { browser } from '../../ua/UA';
import { nearest, create as el } from '../../dom/Element';
import { lookupKey } from '../../dom/DOMEvent';
import ScrollView from '../containers/ScrollView';
import AbstractControlView from './AbstractControlView';

const isFirefox = browser === 'firefox';
const isSafari = browser === 'safari';

/**
    Class: O.TextView

    Extends: O.AbstractControlView

    A text input control. The `value` property is two-way bindable, representing
    the input text.
*/
const TextView = Class({

    Extends: AbstractControlView,

    init: function (/* ...mixins */) {
        TextView.parent.constructor.apply( this, arguments );
        this._settingFromInput = false;
    },

    /**
        Property: O.TextView#isMultiline
        Type: Boolean
        Default: false

        If set to true, the text field will accept line breaks.

        This property *must not* be changed after the view has been rendered.
    */
    isMultiline: false,

    /**
        Property: O.TextView#isExpanding
        Type: Boolean
        Default: false

        If <#isMultiline> is set to true, setting <#isExpanding> to true will
        make it automatically expand vertically to fit its contents, rather than
        show a scrollbar.
    */
    isExpanding: false,

    /**
        Property: O.TextView#isValid
        Type: Boolean
        Default: true

        If false, an `invalid' class will be added to the view's class name.
    */
    isValid: true,

    /**
        Property: O.TextView#isHighlighted
        Type: Boolean
        Default: false

        If true, a `highlight` class will be added to the view's class name.
        This is a styling hook for highlighting the view, e.g. if it fails
        validation.
    */
    isHighlighted: false,

    /**
        Property: O.TextView#inputType
        Type: String
        Default: "text"

        The type property for the <input> DOM node (e.g. "password", "tel" etc.)

        This property *must not* be changed after the view has been rendered.
    */
    inputType: 'text',

    /**
        Property: O.TextView#placeholder
        Type: String
        Default: ''

        Placeholder text to be displayed in the text input when it is empty.
    */
    placeholder: '',

    /**
        Property: O.TextView#value
        Type: String
        Default: ''

        The value currently input in the text field.
    */
    value: '',

    /**
        Property: O.TextView#inputAttributes
        Type: Object

        Extra attributes to add to the text view. Examples include:

        - maxLength: Number
        - autocomplete: 'on' or 'off'
        - autocapitalize: 'on' or 'off'
        - autocorrect: 'on' or 'off'
        - pattern: String (regexp)
    */
    inputAttributes: {
        autocomplete: 'off',
    },

    /**
        Property: O.TextView#selection
        Type: Object

        When used as a getter, this will return an object with two properties:

        start - {Number} The number of characters offset from the beginning of
                the text that the selection starts.
        end   - {Number} The number of characters offset from the beginning of
                the text that the selection ends.

        Note, if there is no selection, the start and end values will be the
        same, and give the position of the cursor.

        When used as a setter, you can give it an object as described above to
        set the selection, or if you just want to give it a cursor position, you
        can pass a number instead.

        Note, this property is *not observable* and cannot be used to monitor
        changes in selection/cursor position.

    */
    selection: function ( selection ) {
        const control = this._domControl;
        const isNumber = ( typeof selection === 'number' );
        let start = selection ? isNumber ?
                    selection : selection.start : 0;
        let end = selection ? isNumber ?
                    selection : selection.end || start : start;
        if ( selection !== undefined ) {
            // Ensure any value changes have been drawn.
            this.redraw();
            // Firefox will throw an error if the control is not actually in the
            // document when trying to set the selection. There might be other
            // situations where it does so as well, so just using a try/catch to
            // guard against all.
            try {
                control.setSelectionRange( start, end );
            } catch ( error ) {}
        } else {
            // Firefox sometimes throws an error if you try to read the
            // selection. Again, probably if the control is not actually in the
            // document.
            try {
                start = control.selectionStart;
                end = control.selectionEnd;
            } catch ( error ) {}
        }
        return selection || {
            start,
            end,
        };
    }.property().nocache(),

    /**
        Property: O.TextView#blurOnKeys
        Type: Object
        Default: { Escape: true }

        For each truthy value in the object, if the user is focused in the
        text view and hits the key, the focus will be removed.
    */
    blurOnKeys: { Escape: true },

    // --- Render ---

    /**
        Property: O.TextView#type
        Type: String

        Will be added to the view's class name.
    */
    type: '',

    layerTag: 'span',

    /**
        Property: O.TextView#className
        Type: String

        Overrides default in <O.View#className>. Will have the class `v-Text`,
        and any classes given in the <#type> property, along with the following
        other class names dependent on state:

        is-highlight - The <#isHighlighted> property is true.
        is-focused  - The <#isFocused> property is true.
        is-invalid   - The <#isValid> property is false.
        is-disabled  - The <#isDisabled> property is true.
    */
    className: function () {
        const type = this.get( 'type' );
        return 'v-Text' +
            ( this.get( 'isExpanding' ) ? ' v-Text--expanding' : '' ) +
            ( this.get( 'isMultiline' ) ? ' v-Text--multiline' : '' ) +
            ( this.get( 'isHighlighted' ) ? ' is-highlighted' : '' ) +
            ( this.get( 'isFocused' ) ? ' is-focused' : '' ) +
            ( this.get( 'isValid' ) ? '' : ' is-invalid' ) +
            ( this.get( 'isDisabled' ) ? ' is-disabled' : '' ) +
            ( type ? ' ' + type : '' );
    }.property( 'type', 'isExpanding', 'isHighlighted',
        'isFocused', 'isValid', 'isDisabled' ),

    /**
        Method: O.TextView#draw

        Overridden to draw view. See <O.View#draw>.
    */
    draw ( layer ) {
        const isMultiline = this.get( 'isMultiline' );
        const control = this._domControl = el(
                isMultiline ? 'textarea' : 'input', {
                    id: this.get( 'id' ) + '-input',
                    className: 'v-Text-input',
                    rows: isMultiline ? '1' : undefined,
                    name: this.get( 'name' ),
                    type: this.get( 'inputType' ),
                    disabled: this.get( 'isDisabled' ),
                    tabIndex: this.get( 'tabIndex' ),
                    placeholder: this.get( 'placeholder' ) || undefined,
                    value: this.get( 'value' ),
                });

        this.redrawInputAttributes();

        layer.title = this.get( 'tooltip' );

        return [
            control,
        ];
    },

    // --- Keep render in sync with state ---

    /**
        Method: O.TextView#textNeedsRedraw

        Calls <O.View#propertyNeedsRedraw> for extra properties requiring
        redraw.
    */
    textNeedsRedraw: function ( self, property, oldValue ) {
        const isValue = ( property === 'value' );
        if ( !isValue || !this._settingFromInput ) {
            this.propertyNeedsRedraw( self, property, oldValue );
        }
        if ( isValue && this.get( 'isExpanding' ) ) {
            this.propertyNeedsRedraw( self, 'textHeight', oldValue );
        }
    }.observes( 'isExpanding', 'value', 'placeholder', 'inputAttributes' ),

    /**
        Method: O.TextView#redrawValue

        Updates the content of the `<textarea>` or `<input>` to match the
        <#value> property.
    */
    redrawValue () {
        this._domControl.value = this.get( 'value' );
    },

    /**
        Method: O.TextView#redrawPlaceholder

        Updates the placeholder text in the DOM when the <#placeholder> property
        changes.
    */
    redrawPlaceholder () {
        this._domControl.placeholder = this.get( 'placeholder' );
    },

    /**
        Method: O.TextView#redrawInputAttributes

        Updates any other properties of the `<input>` element.
    */
    redrawInputAttributes () {
        const inputAttributes = this.get( 'inputAttributes' );
        const control = this._domControl;
        for ( const property in inputAttributes ) {
            control.set( property, inputAttributes[ property ] );
        }
    },

    redrawTextHeight () {
        // Firefox and Safari get pathologically slow when resizing really large
        // text areas, so automatically turn this off in such a case.
        // 2^13 chars is an arbitrary cut off point that seems to be reasonable
        // in practice
        if ( ( isFirefox || isSafari ) &&
                ( this.get( 'value' ) || '' ).length > 8192 ) {
            this.set( 'isExpanding', false );
            return;
        }
        const control = this._domControl;
        const style = control.style;
        const scrollView = this.getParent( ScrollView );
        // Set to auto to collapse it back to one line, otherwise it would
        // never shrink if you delete text.
        style.height = 'auto';
        const scrollHeight = control.scrollHeight;
        // Presto returns 0 immediately after appending to doc.
        if ( scrollHeight ) {
            style.height = scrollHeight + 'px';
        }
        // Collapsing the height will mess with the scroll, so make sure we
        // reset the scroll position back to what it was.
        if ( scrollView ) {
            scrollView.redrawScroll();
        }
    },

    redrawIsExpanding () {
        if ( this.get( 'isExpanding' ) ) {
            this.redrawTextHeight();
        } else {
            this._domControl.style.height = 'auto';
            // Scroll to cursor
            if ( this.get( 'isFocused' ) ) {
                this.blur().focus();
            }
        }
    },

    redrawLabel () {},

    // --- Activate ---

    /**
        Method: O.TextView#activate

        Overridden to focus the text view. See <O.AbstractControlView#activate>.
    */
    activate () {
        this.focus();
    },

    selectAll () {
        return this.set( 'selection', {
            start: 0,
            end: this.get( 'value' ).length,
        });
    },

    copySelectionToClipboard () {
        let focused = null;
        if ( !this.get( 'isFocused' ) ) {
            focused = document.activeElement;
            this.focus();
        }
        let didSucceed = false;
        try {
            didSucceed = document.execCommand( 'copy' );
        }  catch ( error ) {}
        if ( focused ) {
            focused.focus();
        }
        return didSucceed;
    },

    // --- Scrolling and focus ---

    savedSelection: null,

    /**
        Method: O.TextView#didEnterDocument

        Overridden to restore scroll position and selection. See
        <O.View#didEnterDocument>.
    */
    didEnterDocument () {
        TextView.parent.didEnterDocument.call( this );
        if ( this.get( 'isMultiline' ) ) {
            if ( this.get( 'isExpanding' ) ) {
                this.redrawTextHeight();
            }
            // Restore scroll positions:
            const control = this._domControl;
            const left = this.get( 'scrollLeft' );
            const top = this.get( 'scrollTop' );
            if ( left ) {
                control.scrollLeft = left;
            }
            if ( top ) {
                control.scrollTop = top;
            }
            control.addEventListener( 'scroll', this, false );
        }
        const selection = this.get( 'savedSelection' );
        if ( selection ) {
            this.set( 'selection', selection ).focus();
            this.set( 'savedSelection', null );
        }
        return this;
    },

    /**
        Method: O.TextView#willLeaveDocument

        Overridden to save scroll position and selection. See
        <O.View#willLeaveDocument>.
    */
    willLeaveDocument () {
        // If focused, save cursor position
        if ( this.get( 'isFocused' ) ) {
            this.set( 'savedSelection', this.get( 'selection' ) );
            this.blur();
        }
        // Stop listening for scrolls:
        if ( this.get( 'isMultiline' ) ) {
            this._domControl.removeEventListener( 'scroll', this, false );
        }
        return TextView.parent.willLeaveDocument.call( this );
    },

    /**
        Method (private): O.TextView#_syncBackScrolls

        Sets the <O.View#scrollLeft> and <O.View#scrollTop> properties whenever
        the user scrolls the textarea.

        Parameters:
            event - {Event} The scroll event.
    */
    _syncBackScrolls: function ( event ) {
        const control = this._domControl;
        const left = control.scrollLeft;
        const top = control.scrollTop;

        this.beginPropertyChanges()
            .set( 'scrollLeft', left )
            .set( 'scrollTop', top )
        .endPropertyChanges();

        event.stopPropagation();
    }.on( 'scroll' ),

    // --- Keep state in sync with render ---

    /**
        Method: O.TextView#syncBackValue

        Updates the <#value> property when the user interacts with the textarea.

        Parameters:
            event - {Event} The input event.
    */
    syncBackValue: function () {
        this._settingFromInput = true;
        this.set( 'value', this._domControl.value );
        this._settingFromInput = false;
    }.on( 'input' ),

    /**
        Method (private): O.TextView#_onClick

        Focus and set selection to the end.

        Parameters:
            event - {Event} The click event.
    */
    _onClick: function ( event ) {
        if ( event.target === this.get( 'layer' ) ) {
            this.set( 'selection', this.get( 'value' ).length )
                .focus();
        }
    }.on( 'click' ),

    /**
        Method (private): O.TextView#_onKeypress

        Stop IE automatically focussing the nearest button when the user hits
        enter in single line text inputs.

        Parameters:
            event - {Event} The keypress event.
    */
    _onKeypress: function ( event ) {
        // If key == enter, IE will automatically focus the nearest button
        // (presumably as though it were submitting the form). Stop this
        // unless we're actually in a form.
        if ( !this.get( 'isMultiline' ) &&
                lookupKey( event, true ) === 'Enter' &&
                !nearest( this.get( 'layer' ), 'FORM' ) ) {
            event.preventDefault();
        }
    }.on( 'keypress' ),

    /**
        Method (private): O.TextView#_blurOnKey

        Blur the text area when the user hits certain keys, provided by the
        <#blurOnKeys> property.

        Parameters:
            event - {Event} The keyup event.
    */
    _blurOnKey: function ( event ) {
        const key = lookupKey( event, true );
        if ( this.get( 'blurOnKeys' )[ key ] ) {
            this.blur();
        }
    }.on( 'keyup' ),
});

export default TextView;

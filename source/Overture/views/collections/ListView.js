import { Class, guid } from '../../core/Core.js';
import { bind } from '../../foundation/Binding.js';
import '../../foundation/ComputedProps.js';  // For Function#property
import '../../foundation/ObservableProps.js';  // For Function#observes
import UA from '../../ua/UA.js';
import View from '../View.js';

const byIndex = function ( a, b ) {
    return a.get( 'index' ) - b.get( 'index' );
};

const addToTable = function ( array, table ) {
    for ( let i = 0, l = array.length; i < l; i += 1 ) {
        table[ array[i] ] = true;
    }
    return table;
};

const getNextViewIndex = function ( childViews, newRendered, fromIndex ) {
    const length = childViews.length;
    let view, item;
    while ( fromIndex < length ) {
        view = childViews[ fromIndex ];
        item = view.get( 'content' );
        if ( item && newRendered[ guid( item ) ] ) {
            break;
        }
        fromIndex += 1;
    }
    return fromIndex;
};

const ListView = Class({

    Extends: View,

    content: null,
    contentLength: bind( 'content.length' ),

    ItemView: null,
    itemHeight: 0,

    init ( mixin ) {
        this._added = null;
        this._removed = null;
        this._rendered = {};
        this._renderRange = {
            start: 0,
            end: 0x7fffffff, // Max positive signed 32bit int: 2^31 - 1
        };

        this.selection = null;

        ListView.parent.init.call( this, mixin );

        const selection = this.get( 'selection' );
        if ( selection ) {
            selection.addObserverForKey(
                'selectedStoreKeys', this, 'redrawSelection' );
        }
    },

    destroy () {
        const selection = this.get( 'selection' );
        if ( selection ) {
            selection.removeObserverForKey(
                'selectedStoreKeys', this, 'redrawSelection' );
        }
        if ( this.get( 'isRendered' ) ) {
            const content = this.get( 'content' );
            if ( content ) {
                content.removeObserverForRange(
                    this._renderRange, this, 'viewNeedsRedraw' );
                content.off( 'query:updated', this, 'contentWasUpdated' );
            }
        }
        ListView.parent.destroy.call( this );
    },

    contentDidChange: function ( _, __, oldVal, newVal ) {
        if ( this.get( 'isRendered' ) ) {
            const range = this._renderRange;
            if ( oldVal ) {
                oldVal.removeObserverForRange( range, this, 'viewNeedsRedraw' );
                oldVal.off( 'query:updated', this, 'contentWasUpdated' );
            }
            if ( newVal ) {
                newVal.addObserverForRange( range, this, 'viewNeedsRedraw' );
                newVal.on( 'query:updated', this, 'contentWasUpdated' );
            }
            this.viewNeedsRedraw();
        }
    }.observes( 'content' ),

    contentWasUpdated ( event ) {
        if ( this.get( 'isInDocument' ) ) {
            this._added = addToTable( event.added, this._added || {} );
            this._removed = addToTable( event.removed, this._removed || {} );
        }
    },

    layout: function () {
        const itemHeight = this.get( 'itemHeight' );
        let height = itemHeight * ( this.get( 'contentLength' ) || 0 );
        // Firefox breaks in weird and wonderful ways when a scroll area is
        // over a certain height, somewhere between 2^24 and 2^25px tall.
        // 2^24 = 16,777,216
        if ( UA.firefox && height > 16777216 ) {
            height = 16777216;
        }
        return itemHeight ? { height } : {};
    }.property( 'itemHeight', 'contentLength' ),

    draw ( layer, Element/*, el*/ ) {
        // Render any unmanaged child views first.
        const children = ListView.parent.draw.call( this, layer );
        const content = this.get( 'content' );
        if ( children ) {
            Element.appendChildren( layer, children );
        }
        if ( content ) {
            content.addObserverForRange(
                this._renderRange, this, 'viewNeedsRedraw' );
            content.on( 'query:updated', this, 'contentWasUpdated' );
            this.redrawLayer( layer );
        }
    },

    viewNeedsRedraw () {
        this.propertyNeedsRedraw( this, 'layer' );
    },

    // -----------------------------------------------------------------------

    isCorrectItemView ( view, item ) {
        return view.get( 'content' ) === item;
    },

    createItemView ( content, index, list, isAdded ) {
        const ItemView = this.get( 'ItemView' );
        return new ItemView({
            parentView: this,
            content,
            index,
            list,
            isAdded,
            selection: this.get( 'selection' ),
        });
    },

    destroyItemView ( view ) {
        view.destroy();
    },

    redrawLayer ( layer ) {
        const list = this.get( 'content' ) || [];
        const childViews = this.get( 'childViews' );
        const isInDocument = this.get( 'isInDocument' );
        // Limit to this range in the content array.
        const renderRange = this._renderRange;
        const start = Math.max( 0, renderRange.start );
        const end = Math.min( list.get( 'length' ), renderRange.end );
        // Set of already rendered views.
        const rendered = this._rendered;
        const newRendered = this._rendered = {};
        // Are they new or always been there?
        const added = this._added;
        const removed = this._removed;
        // Bookkeeping
        const viewsDidEnterDoc = [];
        let frag = null;
        let currentViewIndex;
        let viewIsInCorrectPosition, i, l, item, id, view, isAdded, isRemoved;

        // Mark views we still need
        for ( i = start, l = end; i < l; i += 1 ) {
            item = list.getObjectAt( i );
            id = item ? guid( item ) : 'null:' + i;
            view = rendered[ id ];
            if ( view && this.isCorrectItemView( view, item, i ) ) {
                newRendered[ id ] = view;
            }
        }

        this.beginPropertyChanges();

        // Remove ones which are no longer needed
        for ( id in rendered ) {
            if ( !newRendered[ id ] ) {
                view = rendered[ id ];
                isRemoved = removed && ( item = view.get( 'content' ) ) ?
                    removed[ item.get( 'storeKey' ) ] : false;
                view.detach( isRemoved );
                this.destroyItemView( view );
            }
        }
        currentViewIndex = getNextViewIndex( childViews, newRendered, 0 );

        // Create/update views in render range
        for ( i = start, l = end; i < l; i += 1 ) {
            item = list.getObjectAt( i );
            id = item ? guid( item ) : 'null:' + i;
            view = newRendered[ id ];
            // Was the view already in the list?
            if ( view ) {
                // Is it in the correct position?
                viewIsInCorrectPosition =
                    childViews[ currentViewIndex ] === view;
                // If not, remove
                if ( !viewIsInCorrectPosition ) {
                    if ( isInDocument ) {
                        view.willLeaveDocument();
                    }
                    layer.removeChild( view.get( 'layer' ) );
                    if ( isInDocument ) {
                        view.didLeaveDocument();
                    }
                }
                // Always update list/index
                view.set( 'index', i )
                    .set( 'list', list );
                // If in correct position, all done
                if ( viewIsInCorrectPosition ) {
                    if ( frag ) {
                        layer.insertBefore( frag, view.get( 'layer' ) );
                        frag = null;
                    }
                    currentViewIndex =
                        getNextViewIndex(
                            childViews, newRendered, currentViewIndex + 1 );
                    continue;
                }
            } else {
                isAdded = added && item ?
                    added[ item.get( 'storeKey' ) ] : false;
                view = this.createItemView( item, i, list, isAdded );
                if ( !view ) {
                    continue;
                }
                newRendered[ id ] = view;
                childViews.push( view );
            }
            if ( !frag ) {
                frag = layer.ownerDocument.createDocumentFragment();
            }
            frag.appendChild( view.render().get( 'layer' ) );
            if ( isInDocument ) {
                view.willEnterDocument();
                viewsDidEnterDoc.push( view );
            }
        }
        if ( frag ) {
            layer.appendChild( frag );
        }
        if ( isInDocument && viewsDidEnterDoc.length ) {
            for ( i = 0, l = viewsDidEnterDoc.length; i < l; i += 1 ) {
                viewsDidEnterDoc[i].didEnterDocument();
            }
        }

        childViews.sort( byIndex );

        this._added = null;
        this._removed = null;
        this.propertyDidChange( 'childViews' );
        this.endPropertyChanges();
    },

    redrawSelection () {
        const selection = this.get( 'selection' );
        const itemViews = this.get( 'childViews' );
        let l = itemViews.length;
        while ( l-- ) {
            const view = itemViews[l];
            const storeKey = view.getFromPath( 'content.storeKey' );
            if ( storeKey ) {
                view.set( 'isSelected',
                    selection.isStoreKeySelected( storeKey ) );
            }
        }
    },

    // --- Can't add views by hand; just bound to content ---

    insertView: null,
    replaceView: null,
});

export default ListView;

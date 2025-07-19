import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';

/**
 * Status of the screen
 */
enum Status {
    visible = 0,
    hidden = 1
}

/**
 * DBus proxy object
 */
export default class Cloak {
    private status: Status;
    private actor: Clutter.Actor;
    private compositor: Meta.Compositor;
    private cursorTracker: Meta.CursorTracker;
    private effect: Clutter.BrightnessContrastEffect;
    private exportedObject?: Gio.DBusExportedObject;
    private ownerId: number;
    private cursorWatcherId = 0;

    /**
     * Creates the objects and exports it on the DBus session bus
     * 
     * Before deleting the object, `close()` must be invoked to close DBus
     * and to cleanup the screen
     * 
     * @param {Clutter.Actor} actor - the main actor to hide
     * @param {Meta.Compositor} compositor - the compositor to disable unredirect on
     * @param {Meta.CursorTracker} cursorTracker - the tracker for the cursor to hide
     */
    constructor(
        actor: Clutter.Actor,
        compositor: Meta.Compositor,
        cursorTracker: Meta.CursorTracker,
    ) {
        this.status = Status.visible;
        this.actor = actor;
        this.compositor = compositor;
        this.cursorTracker = cursorTracker;

        // Create the effect only once
        this.effect = new Clutter.BrightnessContrastEffect();
        this.effect.set_brightness(-1);
        this.effect.set_contrast(0);

        // Own the well-known name on the session bus
        this.ownerId = Gio.DBus.own_name(
            Gio.BusType.SESSION,
            'org.mirolang.Lookout',
            Gio.BusNameOwnerFlags.NONE,
            this.onBusAcquired.bind(this),
            this.onNameAcquired.bind(this),
            this.onNameLost.bind(this));
    }

    /**
     * Cleanup before deleting the object
     */
    close() {
        // Fix the screen
        this.Reveal();
        // Close DBus
        this.exportedObject?.unexport();
        Gio.bus_unown_name(this.ownerId);
        console.debug('Lookout [debug]: closing');
    }

    /////////////////
    // Callbacks
    /////////////////

    /**
     * Invoked when the DBus connection is acquired.
     * 
     * Exports the object immediately so it's available
     * for clients watching for the well-known name.
     * 
     * @param {Gio.DBusConnection} connection - the connection to the bus
     * @param {String} _name - the name requested
     */
    private onBusAcquired(connection: Gio.DBusConnection, _name: String) {
        console.debug(`Lookout [debug]: DBus connection "${connection.get_unique_name()}" acquired`);
        // Make the object available before obtaining the well-known name
        this.exportedObject = Gio.DBusExportedObject.wrapJSObject(this.interfaceSchema, this);
        this.exportedObject.export(connection, '/org/mirolang/Lookout');
    }

    /**
     * Invoked when the DBus well-known name is acquired.
     * 
     * @param {Gio.DBusConnection} connection - the connection to the bus
     * @param {String} _name - the name requested
     */
    private onNameAcquired(_connection: Gio.DBusConnection, _name: String) {
        console.debug('Lookout [debug]: DBus name "org.mirolang.Lookout" acquired (DBus ready)');
        // Nothing to do
    }

    /**
     * Invoked if the name is lost.
     * 
     * This should only happen if the name is already owned.
     * 
     * @param {Gio.DBusConnection} connection - the connection to the bus
     * @param {String} _name - the name requested
     */
    private onNameLost(_connection: Gio.DBusConnection, _name: String) {
        console.error('Lookout [Error]: DBus name "org.mirolang.Lookout" busy');
        // Nothing we can do
    }

    /**
     * Invoked when the cursor being watched visibility changes.
     * 
     * @param {Meta.CursorTracker} tracker - the cursor tracker being watched
     */
    private onVisibilityChanged(tracker: Meta.CursorTracker) {
        // Make the pointer invisible, but only if made visible by something else
        if (tracker.get_pointer_visible()) {
            tracker.set_pointer_visible(false);
        }
    }

    /////////////////
    // DBus
    /////////////////

    /**
     * XML schema for the DBus interface.
     */
    readonly interfaceSchema = '\
<node>\
  <interface name="org.mirolang.Lookout">\
    <method name="Hide"/>\
    <method name="Reveal"/>\
    <property name="Status" type="u" access="read"/>\
  </interface>\
</node>';

    /**
     * Status read-only property.
     * 
     * Available on DBus.
     * 
     * When the property changes it must be signaled on the exported object.
     */
    get Status() {
        console.debug('Lookout [debug]: Status read');
        return this.status;
    }

    /**
     * Turns the screen black and hides the cursor.
     * 
     * Does nothing if the screen is already hidden
     * and signals Status changed if necessary.
     * 
     * It also disables unredirect so it works for fullscreen windows
     * and tracks the visibility changes in the cursor so it can keep
     * the cursor invisible.
     */
    Hide() {
        console.debug('Lookout [debug]: Hide() invoked');
        // Do nothing if already hidden
        if (this.status === Status.visible) {
            this.status = Status.hidden;
            // Disable unredirect
            this.compositor.disable_unredirect();
            // Black out the screen
            this.actor.add_effect(this.effect);
            // Make cursor permanently invisible
            this.cursorWatcherId = this.cursorTracker.connect(
                'visibility-changed',
                this.onVisibilityChanged.bind(this));
            this.cursorTracker.set_pointer_visible(false);
            // Signal Status changed
            this.exportedObject?.emit_property_changed(
                'Status',
                GLib.Variant.new_uint32(this.status));
        }
    }

    /**
     * Turns the screen back to normal.
     * 
     * Does nothing if the screen is already normal
     * and signals Status changed if necessary.
     * 
     * It also re-enables unredirect for performance and untracks 
     * the visibility changes in the cursor so it can keep.
     */
    Reveal() {
        console.debug('Lookout [debug]: Reveal() invoked');
        // Do nothing if already visible
        if (this.status === Status.hidden) {
            this.status = Status.visible;
            // Reenable unredirect
            this.compositor.enable_unredirect();
            // Reveal the screen
            this.actor.remove_effect(this.effect);
            // Stop keeping the cursor hidden
            this.cursorTracker.disconnect(this.cursorWatcherId)
            // Signal Status changed
            this.exportedObject?.emit_property_changed(
                'Status',
                GLib.Variant.new_uint32(this.status));
        }
    }
}
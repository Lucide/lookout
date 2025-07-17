import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
// import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

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
class Service {
    _status: Status;
    _actor: Clutter.Actor;
    _compositor: Meta.Compositor;
    _cursorTracker: Meta.CursorTracker;
    _effect: Clutter.BrightnessContrastEffect;
    _exportedObject?: Gio.DBusExportedObject;
    _ownerId: number;
    _cursorWatcherId = 0;

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
        this._status = Status.visible;
        this._actor = actor;
        this._compositor = compositor;
        this._cursorTracker = cursorTracker;

        // Create the effect only once
        this._effect = new Clutter.BrightnessContrastEffect();
        this._effect.set_brightness(-1);
        this._effect.set_contrast(0);

        // Own the well-known name on the session bus
        this._ownerId = Gio.DBus.own_name(
            Gio.BusType.SESSION,
            'org.mirolang.Lookout',
            Gio.BusNameOwnerFlags.NONE,
            this._onBusAcquired.bind(this),
            this._onNameAcquired.bind(this),
            this._onNameLost.bind(this));
    }

    /**
     * Cleanup before deleting the object
     */
    close() {
        // Fix the screen
        this.Reveal();
        // Close DBus
        this._exportedObject?.unexport();
        Gio.bus_unown_name(this._ownerId);
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
    _onBusAcquired(connection: Gio.DBusConnection, _name: String) {
        console.debug(`Lookout [debug]: DBus connection "${connection.get_unique_name()}" acquired`);
        // Make the object available before obtaining the well-known name
        this._exportedObject = Gio.DBusExportedObject.wrapJSObject(this.interfaceSchema, this);
        this._exportedObject.export(connection, "/org/mirolang/Lookout");
    }

    /**
     * Invoked when the DBus well-known name is acquired.
     * 
     * @param {Gio.DBusConnection} connection - the connection to the bus
     * @param {String} _name - the name requested
     */
    _onNameAcquired(_connection: Gio.DBusConnection, _name: String) {
        console.debug('Lookout [debug]: DBus name "org.mirolang.Lookout" acquired');
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
    _onNameLost(_connection: Gio.DBusConnection, _name: String) {
        console.error('Lookout [Error]: DBus name "org.mirolang.Lookout" busy');
        // Nothing we can do
    }

    /**
     * Invoked when the cursor being watched visibility changes.
     * 
     * @param {Meta.CursorTracker} tracker - the cursor tracker being watched
     */
    _onVisibilityChanged(tracker: Meta.CursorTracker) {
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
        return this._status;
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
        if (this._status === Status.visible) {
            this._status = Status.hidden;
            this._compositor.disable_unredirect();
            this._actor.add_effect(this._effect);
            this._cursorWatcherId = this._cursorTracker.connect(
                "visibility-changed",
                this._onVisibilityChanged.bind(this));
            this._cursorTracker.set_pointer_visible(false);
            this._exportedObject?.emit_property_changed(
                "Status",
                GLib.Variant.new_uint32(this._status));
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
        if (this._status === Status.hidden) {
            this._status = Status.visible;
            this._compositor.enable_unredirect();
            this._actor.remove_effect(this._effect);
            this._cursorTracker.disconnect(this._cursorWatcherId)
            this._exportedObject?.emit_property_changed(
                "Status",
                GLib.Variant.new_uint32(this._status));
        }
    }
}

/**
 * Main extension class
 */
export default class Lookout extends Extension {
    gsettings?: Gio.Settings;
    service?: Service;
    _display = global.display;
    _settings = global.settings;

    /**
     * Invoked when the extension is enabled
     * 
     * Creates the service object (exported on DBus)
     * and binds the keyboard shortcut to `service.Reveal()`
     */
    enable() {
        console.debug('Lookout [debug]: Enabling');
        this.service = new Service(
            global.stage,
            global.compositor,
            global.backend.get_cursor_tracker());
        // this.gsettings = this.getSettings();
        // this._display.add_keybinding(
        //     "Lookout Reveal",
        //     this.gsettings.,
        //     Meta.KeyBindingFlags.CUSTOM_TRIGGER,
        //     () => { this.service?.Reveal() })
        // this.animationsEnabled = this.gsettings!.get_value('padding-inner').deepUnpack() ?? 8
    }

    /**
     * Invoked when the extension is disabled
     * 
     * Close the service object (unexporting it on DBus)
     * and unbinds the keyboard shortcut to `service.Reveal()`
     */
    disable() {
        console.debug('Lookout [debug]: Disabling');
        // this.gsettings = undefined;
        this.service?.close();
        this.service = undefined;
    }
}
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
// import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

// const interfaceSchema = String(GLib.file_get_contents("org.mirolang.Lookout.xml")[0]);
const interfaceSchema = '\
<node>\
  <interface name="org.mirolang.Lookout">\
    <method name="Hide"/>\
    <method name="Reveal"/>\
    <property name="Status" type="u" access="read"/>\
  </interface>\
</node>';

enum Status {
    visible = 0,
    hidden = 1
}

const callbacks = {
    onBusAcquired(self: Service, connection: Gio.DBusConnection, _name: String) {
        console.debug(`Lookout [debug]: DBus connection "${connection.get_unique_name()}" acquired`);
        self._exportedObject = Gio.DBusExportedObject.wrapJSObject(interfaceSchema, self);
        self._exportedObject.export(connection, "/org/mirolang/Lookout");
    },

    onNameAcquired(_self: Service, _connection: Gio.DBusConnection, _name: String) {
        console.debug('Lookout [debug]: DBus name "org.mirolang.Lookout" acquired');

    },

    onNameLost(_self: Service, _connection: Gio.DBusConnection, _name: String) {
        console.error('Lookout [Error]: DBus name "org.mirolang.Lookout" busy');
    },

    onVisibilityChanged(tracker: Meta.CursorTracker) {
        if (tracker.get_pointer_visible()) {
            tracker.set_pointer_visible(false)
        }
    }
}

class Service {
    _status: Status;
    _actor: Clutter.Actor;
    _compositor: Meta.Compositor;
    _cursorTracker: Meta.CursorTracker;
    _effect: Clutter.BrightnessContrastEffect;
    _exportedObject?: Gio.DBusExportedObject;
    _ownerId: number;
    _cursorWatcherId = 0;

    constructor(
        actor: Clutter.Actor,
        compositor: Meta.Compositor,
        cursorTracker: Meta.CursorTracker,
        status = Status.visible
    ) {
        this._status = status;
        this._actor = actor;
        this._compositor = compositor;
        this._cursorTracker = cursorTracker;
        this._effect = new Clutter.BrightnessContrastEffect();
        this._effect.set_brightness_full(-0.5, 0, 0);
        this._effect.set_contrast(0);

        this._ownerId = Gio.DBus.own_name(
            Gio.BusType.SESSION,
            'org.mirolang.Lookout',
            Gio.BusNameOwnerFlags.NONE,
            (connection, name) => { callbacks.onBusAcquired(this, connection, name) },
            (connection, name) => { callbacks.onNameAcquired(this, connection, name) },
            (connection, name) => { callbacks.onNameLost(this, connection, name) });
    }

    close() {
        this.Reveal();
        this._exportedObject?.unexport();
        Gio.bus_unown_name(this._ownerId);
        console.debug('Lookout [debug]: closing');
    }

    // Properties
    get Status() {
        return GLib.Variant.new_uint32(this._status);
    }

    // Methods
    Hide() {
        console.debug('Lookout [debug]: Hide() invoked');
        if (this._status === Status.visible) {
            this._status = Status.hidden;
            this._compositor.disable_unredirect();
            this._actor.add_effect(this._effect);
            this._cursorWatcherId = this._cursorTracker.connect(
                "visibility-changed",
                callbacks.onVisibilityChanged);
            this._cursorTracker.set_pointer_visible(false);
            this._exportedObject?.emit_property_changed(
                "Status",
                GLib.Variant.new_uint32(this._status));
        }
    }

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


export default class Lookout extends Extension {
    gsettings?: Gio.Settings;
    service?: Service;
    _display = global.display;
    _settings = global.settings;

    enable() {
        console.debug('Lookout [debug]: Enabling');
        this.service = new Service(global.stage, global.compositor, global.backend.get_cursor_tracker());
        // this.gsettings = this.getSettings();
        // this._display.add_keybinding(
        //     "Lookout Reveal",
        //     this.gsettings.,
        //     Meta.KeyBindingFlags.CUSTOM_TRIGGER,
        //     () => { this.service?.Reveal() })
        // this.animationsEnabled = this.gsettings!.get_value('padding-inner').deepUnpack() ?? 8
    }

    disable() {
        console.debug('Lookout [debug]: Disabling');
        // this.gsettings = undefined;
        this.service?.close();
        this.service = undefined;
    }
}
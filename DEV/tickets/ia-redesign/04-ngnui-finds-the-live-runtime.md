# 04: ngnui finds the live runtime itself

**What to build:** starting `ngnui` in a project where `ngn run` is running turns the Editor on, with no flags. Today the editor stays off unless the user copies `--live http://127.0.0.1:<port>` from the `ngn run` readout.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Without `--live`, ngnui reads `port` from the project config the same way it already reads `dbPath`, and probes the loopback runtime's meta endpoint
- [x] When the probe answers as an ngn runtime, the editor is enabled and the startup readout says where it connected
- [x] When nothing answers, the readout says the editor is off and how to start a runtime. It doesn't fail
- [x] An explicit `--live` always wins and is never replaced by the detected one
- [x] The probe targets loopback and nothing else. A config can't point ngnui at another host
- [x] The ngnui README and `--help` describe the detection

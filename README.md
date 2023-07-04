Tries to implement https://gist.github.com/orta/f80db73c6e8211211e3d224a5ab47624 so that folks can figure out what works and what doesn't.

Currently uses a fork of TypeScript which exposes the types in TS2322 error messages so that an outside client can use them. You can see that here: https://github.com/orta/TypeScript/pull/new/diagnostic_types

I'm planning on working through the gist, and then making a playground for folks to be able to have a REPL to run this locally - then I guess once it's polished enough I'll present it to the TS team and see where it can go

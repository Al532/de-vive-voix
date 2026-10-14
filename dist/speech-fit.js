(function(root){'use strict';
root.SpeechFit={create:async(context,buffers)=>(await import('./tempo-stretch.mjs?v=speech-fit-1')).createFitter(context,buffers)};
})(globalThis);

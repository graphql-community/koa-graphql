/* eslint-disable callback-return */

import thenify from 'thenify';
import multer from 'multer';

export default function multerWrapper(options) {
  const upload = multer(options);
  const _single = upload.single.bind(upload);
  upload.single = function(param) {
    return async function(ctx, next) {
      const thenified = thenify(_single(param));
      await thenified(ctx.req, ctx.res);
      await next();
    };
  };
  return upload;
}

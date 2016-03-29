/* eslint-disable callback-return */

import thenify from 'thenify';
import multer from 'multer';


export default function multerWrapper(options) {
  var upload = multer(options);
  var _single = upload.single.bind(upload);
  upload.single = function (param) {
    return async function (ctx, next) {
      var thenified = thenify(_single(param));
      await thenified(ctx.req, ctx.res);
      await next();
    };
  };
  return upload;
}

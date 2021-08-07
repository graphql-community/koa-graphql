// @flow strict

import util from 'util';

import multer from 'multer';

export default function multerWrapper(options) {
  const upload = multer(options);
  const _single = upload.single.bind(upload);
  upload.single = function (param) {
    return async function (ctx, next) {
      const promisified = util.promisify(_single(param));
      await promisified(ctx.req, ctx.res);
      return next();
    };
  };
  return upload;
}

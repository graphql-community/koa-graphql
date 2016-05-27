import thenify from 'thenify';
import multer from 'multer';


export default function multerWrapper(options) {
  const upload = multer(options);
  const _single = upload.single.bind(upload);
  upload.single = function (param) {
    return function *(next) {
      const thenified = thenify(_single(param));
      yield thenified(this.req, this.res);
      yield next;
    };
  };
  return upload;
}

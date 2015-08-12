import thenify from 'thenify';
import multer from 'multer';


export default function multerWrapper(options) {
  var upload = multer(options);
  var _single = upload.single.bind(upload);
  upload.single = function (param) {
    return function *(next) {
      var thenified = thenify(_single(param));
      yield thenified(this.req, this.res);
      yield next;
    };
  };
  return upload;
}

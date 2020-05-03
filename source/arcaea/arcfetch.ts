import { btoa } from 'abab';
import syslog from '../corefunc/syslog';
import fetch, { Request } from 'node-fetch';

const TAG: string = 'corefunc/arcfetch.ts';
class ArcFetchRequest extends Request {

  constructor(method: ArcFetchMethod, resturl: ArcFetchRestUrl, init: ArcFetchExtra) {

    // request url
    let _request_url: ArcFetchRestUrl =
      `https://arcapi.lowiro.com/${ARCAPI_VERSION}/${resturl}`;

    // http headers
    const _request_headers: ArcFetchHeaders = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      'AppVersion': ARCAPI_APPVERSION,
      'User-Agent': ARCAPI_USERAGENT,
      'Host': 'arcapi.lowiro.com',
      'Connection': 'Keep-Alive'
    }

    // extra identity header
    if (init.userToken) {
      _request_headers['Accept-Encoding'] = 'identity';
      _request_headers['Authorization'] = `Bearer ${init.userToken}`;
    }
    else if (init.userName && init.userPasswd) {
      _request_headers['Accept-Encoding'] = 'identity';
      _request_headers['Authorization'] = `Basic ${btoa(`${init.userName}:${init.userPasswd}`)}`;
    }

    // extra device header
    if (init.deviceId) {
      _request_headers['DeviceId'] = init.deviceId;
    }

    // append init.submitData after url if method is GET
    // otherwise it's post data
    let _request_body: any = null;
    if (init.submitData) {
      if (method == 'GET' && init.submitData instanceof URLSearchParams) {
        _request_url += '?' + init.submitData;
      }
      else if (method == 'POST') {
        _request_body = init.submitData;
      }
    }

    super(_request_url, {
      method: method,
      headers: _request_headers,
      body: _request_body
    });

  }

}

const do_fetch = (request: ArcFetchRequest): Promise<any> => {
  return new Promise(async (resolve, reject) => {

    // request origin arcapi
    return await fetch(request)
      .then((response) => {
        return response.text();
      })

      // try parse json
      // print rawdata when failing
      .then((rawdata) => {
        try {
          return JSON.parse(rawdata);
        } catch (e) {
          syslog.e(TAG, 'Arcapi currently unavailable');
          syslog.e(TAG, rawdata);

          // The Arcaea network is currently under maintenance.
          return reject(9);
        }
      })

      // ensure it's a json
      .then((root) => {
        if (root.success)
          return resolve(root);
        else {

          const _errcode =
            root.error_code != undefined ? root.error_code : root.code;

          syslog.e(TAG, `Arcapi returns an error => ${_errcode}`);
          syslog.e(TAG, JSON.stringify(root));

          return reject(_errcode);
        }
      })

      // any errors
      .catch((e) => {
        return reject(e);
      });

  });

}

/**
 * fetch wrapper for arcapis
 * @param {ArcFetchRequest} request
 */
const arcfetch = async (request: ArcFetchRequest): Promise<any> => {

  let _retry = 0;
  while (true) {

    try {
      return await do_fetch(request);
    }
    catch (e) {
      _retry += 1;
      syslog.w(TAG, `Failed... retrying ${_retry}/${ARCAPI_RETRY}`);

      if (e instanceof Error)
        syslog.e(TAG, e.stack);


      // do not retry when some error occurred
      // like has been banned or service not available or etc.
      // only do retry when like request timed out or etc.
      else if (typeof e == 'number' || e == 'UnauthorizedError') {
        _retry = ARCAPI_RETRY;
        syslog.w(TAG, `Retry canceled => errcode ${e}`);
      }

      if (_retry >= ARCAPI_RETRY) throw e;

    }

  }

}

export default arcfetch;
export { ArcFetchRequest };

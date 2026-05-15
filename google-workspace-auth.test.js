// google-workspace-auth.test.js - First-class Google authorization primitives
// WHY: Gmail and Calendar apps should use Clear syntax, not script escape hatches.

import { describe, it, expect } from './lib/testUtils.js';
import { compileProgram } from './index.js';

describe('Google Workspace primitives', () => {
  it('emits Google auth routes and Gmail plus Calendar search helpers from Clear syntax', () => {
    const source = [
      'build for web and javascript backend',
      'use google workspace',
      '',
      "page 'Connections' at '/connections':",
      "  heading 'Connections'",
      "  button 'Authorize Gmail + Calendar':",
      '    login with google',
      '',
      'when user calls GET /api/inbox/search sending query:',
      "  gmail_results = search gmail for query's q",
      '  send back gmail_results',
      '',
      'when user calls GET /api/calendar/search sending query:',
      "  calendar_events = search google calendar for query's q",
      '  send back calendar_events',
    ].join('\n');

    const compile_output = compileProgram(source);

    expect(compile_output.errors).toEqual([]);
    expect(compile_output.ast.body.some((ast_node) => ast_node.type === 'google_workspace')).toBe(true);
    expect(hasGoogleLogin(compile_output.ast.body)).toBe(true);

    expect(compile_output.serverJS).toContain('/api/google/auth/start');
    expect(compile_output.serverJS).toContain('/api/google/auth/callback');
    expect(compile_output.serverJS).toContain('/api/google/auth/status');
    expect(compile_output.serverJS).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(compile_output.serverJS).toContain('https://oauth2.googleapis.com/token');
    expect(compile_output.serverJS).toContain('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    expect(compile_output.serverJS).toContain('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    expect(compile_output.serverJS).toContain('_google_workspace_tokens');
    expect(compile_output.serverJS).toContain('clear_google_oauth_state');
    expect(compile_output.serverJS).toContain('expectedState !== req.query.state');
    expect(compile_output.serverJS).toContain('attendees');
    expect(compile_output.serverJS).toContain('email');
    const js_status_route = routeSlice(compile_output.serverJS, "app.get('/api/google/auth/status'", '// Built-in utilities');
    expect(js_status_route).not.toContain('access_token');
    expect(js_status_route).not.toContain('refresh_token');

    expect(compile_output.javascript).toContain("window.location.href = '/api/google/auth/start'");
    expect(source).not.toContain('script:');
  });

  it('emits Python Google auth routes and search helpers from the same Clear syntax', () => {
    const source = [
      'build for python backend',
      'use google workspace',
      '',
      'when user calls GET /api/calendar/search sending query:',
      "  calendar_events = search google calendar for query's q",
      '  send back calendar_events',
    ].join('\n');

    const compile_output = compileProgram(source);

    expect(compile_output.errors).toEqual([]);
    expect(compile_output.python).toContain('@app.get("/api/google/auth/start")');
    expect(compile_output.python).toContain('@app.get("/api/google/auth/callback")');
    expect(compile_output.python).toContain('@app.get("/api/google/auth/status")');
    expect(compile_output.python).toContain('https://oauth2.googleapis.com/token');
    expect(compile_output.python).toContain('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    expect(compile_output.python).toContain('clear_google_oauth_state');
    expect(compile_output.python).toContain('expected_state != returned_state');
    expect(compile_output.python).toContain('attendees');
    expect(compile_output.python).toContain('email');
    const python_status_route = routeSlice(compile_output.python, '@app.get("/api/google/auth/status")', '# clear:');
    expect(python_status_route).not.toContain('access_token');
    expect(python_status_route).not.toContain('refresh_token');
  });
});

function routeSlice(source, startMarker, endMarker) {
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker, startIndex);
  return source.slice(startIndex, endIndex === -1 ? source.length : endIndex);
}

function hasGoogleLogin(nodes) {
  for (const ast_node of nodes || []) {
    if (ast_node.type === 'login_action' && ast_node.provider === 'google') return true;
    if (hasGoogleLogin(ast_node.body)) return true;
  }
  return false;
}

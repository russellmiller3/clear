# landing/images

Static screenshots referenced by `landing/*.html`.

## Expected files

- `deal-desk-demo.png` — referenced by `landing/marcus.html` "Live demo" section.
  - Recommended: 1600x1000 PNG of the Deal Desk `/cro` Pending Queue view in
    the ivory theme. Match the visual style of `landing/marcus-app-target.html`.
  - While missing, the section renders a styled placeholder. To swap in the
    real image, replace the `<div class="screenshot-placeholder">...</div>`
    block in `marcus.html` with:
    `<img src="images/deal-desk-demo.png" alt="Deal Desk app — pending discount approval queue">`
</content>
</invoke>
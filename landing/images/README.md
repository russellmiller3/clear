# landing/images

Static screenshots referenced by `landing/*.html`.

## Status

`marcus.html`'s "Live demo" section is now an **inline HTML/CSS mock** of the
CRO approver view — no PNG asset required. The mock pairs with the hero's
submitter view (rep submitting a discount request) to show both sides of
the deal-desk workflow on the page. Either view can be replaced with a
real screenshot later if the live deploy lands and the visual is sharper
than the inline mock.

## If you do swap to a real screenshot

Recommended: 1600x1000 PNG of the Deal Desk `/cro` Pending Queue view in
the ivory theme. Match the visual style of `landing/marcus-app-target.html`.
Replace the inline `<div class="p-8 bg-[#f8f9fb]">...</div>` block inside
`#live-demo .demo-frame` with:

```html
<img src="images/deal-desk-demo.png" alt="Deal Desk — CRO approver view">
```
</content>
</invoke>
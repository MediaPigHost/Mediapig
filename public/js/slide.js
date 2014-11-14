define(['require', 'exports', 'module', 'move', 'helpers'], function (require, exports, module, move, helpers) {
    var maxMovement;

    var slider = {
        init: function (element, config) {

            console.log(element);

            var child       = element.getElementsByClassName(config.childClass);
            var childWidth  = 0;
            var firstChild  = child[0];

            for (var x = 0, length = firstChild.childNodes.length; x < length; x++) {
                var childNode = firstChild.childNodes[x];
                childWidth += childNode.offsetWidth;
            }

            var movementRoom = childWidth - firstChild.offsetWidth;

            firstChild.style.width = childWidth + 'px';

            var childRect       = firstChild.getBoundingClientRect();
            var parentRect      = element.getBoundingClientRect();
            var parentPadding   = (element.offsetWidth - firstChild.offsetWidth + movementRoom) / 2;
            var childX          = childRect.left;
            var parentX         = parentRect.left + parentPadding;

            var data = {
                childx: childX,
                parentx: parentX,
                movementRoom: movementRoom,
                childWidth: firstChild.offsetWidth,
                childrenWidth: childWidth
            };

            slider.createArrows(element, config, data);
        },
        createArrows: function (parent, config, data) {
            console.log(parent);

            var leftArrow = '<a href="#" class="slide-arrow-left icon-arrow-left"></a>';
            var rightArrow = '<a href="#" class="slide-arrow-right icon-uniE604"></a>';

            parent.insertAdjacentHTML('beforeend', leftArrow);
            parent.insertAdjacentHTML('beforeend', rightArrow);

            slider.arrowEvents(parent, config, data);
        },
        arrowEvents: function (nav, config, data) {

            move.defaults = {
                duration: 5000
            };

            nav.getElementsByClassName('slide-arrow-right')[0].addEventListener('mouseenter', function (event) {

                var targetParent = event.currentTarget.parentNode.getElementsByClassName(config.childClass)[0];

                move.defaults.duration = targetParent.childNodes.length * 250;

                var movepos = data.movementRoom + ((data.childx - data.parentx) * 2);
                move(targetParent).set('margin-left', '-' + movepos).end();
                targetParent.style.webkitAnimationPlayState = "running";
            });

            nav.getElementsByClassName('slide-arrow-left')[0].addEventListener('mouseenter', function (event) {

                var targetParent = event.currentTarget.parentNode.getElementsByClassName(config.childClass)[0];

                move.defaults.duration = targetParent.childNodes.length * 250;

                move(targetParent).set('margin-left', 0).end();

                targetParent.style.webkitAnimationPlayState = "running";
            });

            nav.getElementsByClassName('slide-arrow-right')[0].addEventListener('mouseleave', function (event) {

                var targetParent = event.currentTarget.parentNode.getElementsByClassName(config.childClass)[0];

                move.defaults.duration = targetParent.childNodes.length * 250;

                targetParent.style.webkitTransitionDuration = '0s';
                targetParent.style.webkitAnimationPlayState = "paused";
                targetParent.style.marginLeft = move(targetParent).current('margin-left');
            });

            nav.getElementsByClassName('slide-arrow-left')[0].addEventListener('mouseleave', function (event) {

                var targetParent = event.currentTarget.parentNode.getElementsByClassName(config.childClass)[0];

                move.defaults.duration = targetParent.childNodes.length * 250;

                targetParent.style.webkitTransitionDuration = '0s';
                targetParent.style.webkitAnimationPlayState = "paused";
                targetParent.style.marginLeft = move(targetParent).current('margin-left');
            });
        }
    };
    module.exports = slider;
});
